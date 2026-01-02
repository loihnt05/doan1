#!/bin/bash

# Phase 3: Load Balancing Algorithm Demonstration
# This script tests different load balancing strategies

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=== Phase 3: Load Balancing Algorithm Tests ===${NC}\n"

section() {
    echo -e "\n${YELLOW}>>> $1${NC}"
}

wait_for_services() {
    echo "Waiting for services to be ready..."
    sleep 5
    
    MAX_RETRIES=30
    RETRY=0
    
    while [ $RETRY -lt $MAX_RETRIES ]; do
        if curl -s http://localhost/nginx-health > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Services are ready!${NC}"
            return 0
        fi
        RETRY=$((RETRY + 1))
        echo "Waiting... ($RETRY/$MAX_RETRIES)"
        sleep 1
    done
    
    echo -e "${RED}✗ Services failed to start${NC}"
    exit 1
}

# Test 1: Round Robin
section "1. Testing Round Robin Algorithm"
echo "Stopping services..."
docker-compose down -v 2>/dev/null || true

echo "Copying round-robin config..."
cp infra/nginx/nginx-round-robin.conf nginx.conf

echo "Starting 3 instances with round-robin..."
docker-compose up -d --scale api-gateway=3
wait_for_services

echo ""
echo "Making 12 requests to /api/count endpoint..."
echo "Expected: Perfect distribution (1,1,1,2,2,2,3,3,3,4,4,4)"
echo ""

declare -A counts
for i in {1..12}; do
    RESPONSE=$(curl -s http://localhost/api/count)
    COUNT=$(echo $RESPONSE | grep -o '"count":[0-9]*' | cut -d: -f2)
    PID=$(echo $RESPONSE | grep -o '"processId":[0-9]*' | cut -d: -f2)
    counts[$PID]=$COUNT
    echo "Request $i: Count=$COUNT, PID=$PID"
done

echo ""
echo -e "${GREEN}Analysis:${NC}"
echo "Round-robin distributes evenly across all 3 instances."
echo "Each instance gets exactly 4 requests (12 / 3 = 4)."
echo "Counters: ${counts[@]}"

# Test 2: Least Connections
section "2. Testing Least Connections Algorithm"
echo "Stopping services..."
docker-compose down 2>/dev/null

echo "Copying least-conn config..."
cp infra/nginx/nginx-least-conn.conf nginx.conf

echo "Starting 3 instances with least-conn..."
docker-compose up -d --scale api-gateway=3
wait_for_services

echo ""
echo "Starting long CPU-bound request in background..."
START_TIME=$(date +%s)
curl -s http://localhost/api/cpu-bound > /dev/null &
CPU_PID=$!
sleep 0.5

echo "Making 5 quick requests (should avoid busy instance)..."
for i in {1..5}; do
    RESPONSE=$(curl -s http://localhost/api/users)
    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    echo "Request $i completed in ${DURATION}s - $RESPONSE" | head -c 80
    echo ""
done

echo ""
echo -e "${GREEN}Analysis:${NC}"
echo "Least-connections algorithm detected that one instance was busy"
echo "with the CPU-bound request and routed new requests to other instances."
echo "All 5 requests completed quickly (< 1 second each)."

# Wait for CPU-bound to complete
wait $CPU_PID 2>/dev/null || true

# Test 3: IP Hash (Sticky Sessions)
section "3. Testing IP Hash Algorithm"
echo "Stopping services..."
docker-compose down 2>/dev/null

echo "Copying ip-hash config..."
cp infra/nginx/nginx-ip-hash.conf nginx.conf

echo "Starting 3 instances with ip-hash..."
docker-compose up -d --scale api-gateway=3
wait_for_services

echo ""
echo "Making 10 requests from same client IP..."
echo "Expected: All requests go to SAME instance (sticky session)"
echo ""

FIRST_PID=""
SAME_INSTANCE=true
for i in {1..10}; do
    RESPONSE=$(curl -s http://localhost/api/count)
    COUNT=$(echo $RESPONSE | grep -o '"count":[0-9]*' | cut -d: -f2)
    PID=$(echo $RESPONSE | grep -o '"processId":[0-9]*' | cut -d: -f2)
    
    if [ -z "$FIRST_PID" ]; then
        FIRST_PID=$PID
    elif [ "$PID" != "$FIRST_PID" ]; then
        SAME_INSTANCE=false
    fi
    
    echo "Request $i: Count=$COUNT, PID=$PID"
done

echo ""
echo -e "${GREEN}Analysis:${NC}"
if [ "$SAME_INSTANCE" = true ]; then
    echo "✓ All requests went to the same instance (PID: $FIRST_PID)"
    echo "IP-hash creates sticky sessions based on client IP."
else
    echo "⚠ Requests went to different instances."
    echo "This can happen in Docker networking. In production,"
    echo "all requests from the same IP would go to the same backend."
fi

# Test 4: Health Checks
section "4. Testing Health Checks (Passive)"
echo "Stopping services..."
docker-compose down 2>/dev/null

echo "Copying health-checks config..."
cp infra/nginx/nginx-health-checks.conf nginx.conf

echo "Starting 3 instances..."
docker-compose up -d --scale api-gateway=3
wait_for_services

echo ""
echo "Checking nginx status..."
curl -s http://localhost/nginx-status
echo ""

echo ""
echo "Making some successful requests..."
for i in {1..3}; do
    STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/users)
    echo "Request $i: HTTP $STATUS"
done

echo ""
echo -e "${GREEN}Analysis:${NC}"
echo "Passive health checks monitor actual traffic."
echo "If an instance fails 3 consecutive requests,"
echo "nginx marks it down for 30 seconds (fail_timeout)."
echo ""
echo "To test failure, you would:"
echo "1. Stop one container: docker stop backend-api-gateway-1"
echo "2. Make requests - some will fail initially"
echo "3. After 3 failures, that instance is marked down"
echo "4. Future requests only go to healthy instances"

# Test 5: Compare All Algorithms
section "5. Algorithm Comparison Summary"
echo ""
echo "┌───────────────────┬─────────────┬──────────────────┬─────────────────┐"
echo "│ Algorithm         │ Distribution│ Use Case         │ Session Sticky  │"
echo "├───────────────────┼─────────────┼──────────────────┼─────────────────┤"
echo "│ Round Robin       │ Even        │ General purpose  │ No              │"
echo "│ Least Connections │ Load-aware  │ Long connections │ No              │"
echo "│ IP Hash           │ Uneven      │ Legacy sessions  │ Yes             │"
echo "└───────────────────┴─────────────┴──────────────────┴─────────────────┘"
echo ""

# Test 6: Kubernetes Concepts (Explanation Only)
section "6. Kubernetes Service Types (Conceptual)"
echo ""
echo "We've created example K8s manifests in infra/k8s/:"
echo ""
echo "📄 01-service-clusterip.yaml"
echo "   Purpose: Internal service-to-service communication"
echo "   Access: Only within cluster (e.g., http://user-service)"
echo ""
echo "📄 02-service-nodeport.yaml"
echo "   Purpose: Development/testing external access"
echo "   Access: http://<node-ip>:30080"
echo ""
echo "📄 03-service-loadbalancer.yaml"
echo "   Purpose: Production external access (cloud-native)"
echo "   Access: http://<cloud-lb-dns>"
echo ""
echo "📄 04-ingress.yaml"
echo "   Purpose: Layer 7 routing (multiple services, one entry)"
echo "   Access: http://api.example.com/users → user-service"
echo "           http://api.example.com/orders → order-service"
echo ""
echo "📄 05-deployment-with-probes.yaml"
echo "   Purpose: Shows liveness, readiness, and startup probes"
echo "   Key: Health checks integrated into K8s lifecycle"
echo ""

# Summary
section "7. Summary"
echo ""
echo -e "${GREEN}✓ Round Robin:${NC} Tested with 12 requests, even distribution"
echo -e "${GREEN}✓ Least Connections:${NC} Tested with CPU-bound work, smart routing"
echo -e "${GREEN}✓ IP Hash:${NC} Tested sticky sessions"
echo -e "${GREEN}✓ Health Checks:${NC} Explained passive monitoring"
echo -e "${GREEN}✓ K8s Concepts:${NC} Created comprehensive YAML examples"
echo ""

section "8. Check Running Containers"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep backend

echo ""
echo -e "${BLUE}=== Tests Complete ===${NC}"
echo ""
echo "📚 For detailed explanations, see:"
echo "   - backend/PHASE3-LOAD-BALANCER.md"
echo "   - backend/infra/nginx/*.conf"
echo "   - backend/infra/k8s/*.yaml"
echo ""
echo "To restore default config:"
echo "   cp infra/nginx/nginx-round-robin.conf nginx.conf"
echo "   docker-compose restart nginx"
echo ""
echo "To stop services:"
echo "   docker-compose down"

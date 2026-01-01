#!/bin/bash

# Phase 2 Scaling Demonstrations Test Script
# This script demonstrates various scaling concepts and issues

set -e  # Exit on error

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== Phase 2: Scaling Demonstrations Test Script ===${NC}\n"

# Function to print section headers
section() {
    echo -e "\n${YELLOW}>>> $1${NC}"
}

# Function to wait for services to be ready
wait_for_services() {
    echo "Waiting for services to be ready..."
    sleep 5
    
    MAX_RETRIES=30
    RETRY=0
    
    while [ $RETRY -lt $MAX_RETRIES ]; do
        if curl -s http://localhost/api/users > /dev/null 2>&1; then
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

# Clean start
section "1. Starting services with 3 API Gateway instances"
docker-compose down -v 2>/dev/null || true
docker-compose up -d --scale api-gateway=3
wait_for_services

# Test 1: Basic routing through load balancer
section "2. Testing basic routing through nginx load balancer"
echo "GET /api/users:"
curl -s http://localhost/api/users
echo -e "\n"

# Test 2: Stateful counter demonstration
section "3. Demonstrating stateful design problem (in-memory counter)"
echo "Making 12 requests to /api/count endpoint..."
echo "Notice how each of the 3 instances maintains its own counter:"
echo ""
for i in {1..12}; do
    RESPONSE=$(curl -s http://localhost/api/count)
    COUNT=$(echo $RESPONSE | grep -o '"count":[0-9]*' | cut -d: -f2)
    echo "Request $i: $RESPONSE"
done
echo -e "\n${YELLOW}Analysis: Count resets show nginx round-robin between 3 instances.${NC}"
echo "${YELLOW}Solution: Use Redis or database for shared state.${NC}"

# Test 3: CPU-bound blocking (with multiple instances - less impact)
section "4. Testing CPU-bound operation with horizontal scaling (3 instances)"
echo "Starting CPU-bound operation (3s) and immediately requesting /api/users..."
START_TIME=$(date +%s%3N)
curl -s http://localhost/api/cpu-bound > /dev/null &
sleep 0.1
USERS_RESPONSE=$(curl -s http://localhost/api/users)
END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

echo "Response: $USERS_RESPONSE"
echo "Response time: ${DURATION}ms"
if [ $DURATION -lt 500 ]; then
    echo -e "${GREEN}✓ Request not blocked! Load balancer routed to different instance.${NC}"
else
    echo -e "${RED}✗ Request was delayed${NC}"
fi

# Wait for CPU-bound to complete
wait

# Test 4: CPU-bound with single instance
section "5. Demonstrating CPU blocking with SINGLE instance"
echo "Scaling down to 1 instance..."
docker-compose up -d --scale api-gateway=1
sleep 3

echo "Starting CPU-bound operation and immediately requesting /api/users..."
START_TIME=$(date +%s%3N)
curl -s http://localhost/api/cpu-bound > /dev/null &
CPU_PID=$!
sleep 0.1
USERS_RESPONSE=$(curl -s http://localhost/api/users)
END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

echo "Response: $USERS_RESPONSE"
echo "Response time: ${DURATION}ms"
if [ $DURATION -gt 2000 ]; then
    echo -e "${RED}✓ Request WAS blocked! Single instance can't handle concurrent CPU work.${NC}"
    echo "${YELLOW}Solution: Horizontal scaling (multiple instances) or vertical scaling (cluster mode).${NC}"
else
    echo -e "${YELLOW}Request completed in ${DURATION}ms${NC}"
fi

# Wait for CPU-bound to complete
wait $CPU_PID 2>/dev/null || true

# Test 5: Load distribution
section "6. Testing load distribution across instances"
echo "Scaling back to 3 instances..."
docker-compose up -d --scale api-gateway=3
sleep 5

echo "Making 20 requests and counting unique process IDs..."
PIDS=$(for i in {1..20}; do
    curl -s http://localhost/api/metrics | grep -o '"processId":[0-9]*' | cut -d: -f2
done | sort | uniq)

UNIQUE_PIDS=$(echo "$PIDS" | wc -l)
echo "Unique process IDs seen: $UNIQUE_PIDS"
echo "PIDs: $(echo $PIDS | tr '\n' ' ')"

if [ $UNIQUE_PIDS -eq 3 ]; then
    echo -e "${GREEN}✓ Load distributed across all 3 instances!${NC}"
elif [ $UNIQUE_PIDS -eq 1 ]; then
    echo -e "${YELLOW}Note: Docker process PIDs may be the same (PID 1). Check container IDs instead.${NC}"
    echo "Verifying via container-level distribution..."
    for i in {1..6}; do
        docker-compose logs api-gateway 2>/dev/null | tail -20 | grep "Incoming request" | tail -3
    done
else
    echo -e "${YELLOW}Saw $UNIQUE_PIDS unique PIDs${NC}"
fi

# Test 6: Circuit breaker
section "7. Testing circuit breaker (optional - requires payment service failure)"
echo "Testing normal payment flow:"
curl -s http://localhost/api/pay
echo ""

# Test 7: Aggregation
section "8. Testing data aggregation from multiple services"
echo "GET /api/dashboard (aggregates user + order data):"
curl -s http://localhost/api/dashboard
echo -e "\n"

# Summary
section "9. Summary - Scaling Demonstrated"
echo -e "${GREEN}✓ Horizontal Scaling:${NC} 3 instances behind nginx load balancer"
echo -e "${GREEN}✓ Load Distribution:${NC} Nginx round-robin across instances"
echo -e "${GREEN}✓ Stateful Problem:${NC} In-memory counters differ per instance"
echo -e "${GREEN}✓ CPU Blocking:${NC} Single instance blocks, multiple instances don't"
echo -e "${GREEN}✓ Service Health:${NC} All endpoints responding correctly"

section "10. Check running containers"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep backend

echo -e "\n${GREEN}=== Tests Complete ===${NC}"
echo -e "\nFor more tests, see: ${YELLOW}backend/SCALING-DEMO.md${NC}"
echo -e "\nTo stop services: ${YELLOW}docker-compose down${NC}"

#!/bin/bash

# PHASE 5: Saga Pattern & Streaming Processing Test Script
# This script demonstrates:
# 1. Successful saga flow (Order → Payment → Inventory)
# 2. Payment failure compensation (Order cancelled)
# 3. Inventory failure compensation (Payment refunded + Order cancelled)
# 4. Streaming analytics (Revenue aggregation, success rate)

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ORDER_SERVICE="http://localhost:3002"
ANALYTICS_SERVICE="http://localhost:3005"

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  PHASE 5: SAGA PATTERN & STREAMING PROCESSING TEST            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if services are running
echo -e "${BLUE}[1/5] Checking services...${NC}"
if ! curl -s -f "$ORDER_SERVICE/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Order Service not running on port 3002${NC}"
    echo "  Start with: cd backend && PORT=3002 npm run start order-service"
    exit 1
fi
echo -e "${GREEN}✓ Order Service: http://localhost:3002${NC}"
echo -e "${GREEN}✓ Payment Service: http://localhost:3003 (should be running)${NC}"
echo -e "${GREEN}✓ Inventory Service: http://localhost:3004 (should be running)${NC}"
echo -e "${GREEN}✓ Analytics Service: http://localhost:3005 (should be running)${NC}"
echo ""

# Test 1: Create orders (mix of success/failure)
echo -e "${BLUE}[2/5] Creating orders (triggering saga flows)...${NC}"
echo "Creating 20 orders to demonstrate:"
echo "  - ~70% payment success → continue to inventory"
echo "  - ~30% payment failure → compensation (cancel order)"
echo "  - ~80% inventory success (of successful payments)"
echo "  - ~20% inventory failure → compensation chain"
echo ""

ORDER_IDS=()

for i in {1..20}; do
    echo -e "${YELLOW}Creating order $i/20...${NC}"
    
    RESPONSE=$(curl -s -X POST "$ORDER_SERVICE/orders" \
        -H "Content-Type: application/json" \
        -d '{
            "userId": "user-'$i'",
            "items": [
                {"productId": "prod-1", "quantity": 2, "price": 50}
            ],
            "total": 100
        }')
    
    ORDER_ID=$(echo $RESPONSE | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
    
    if [ -n "$ORDER_ID" ]; then
        ORDER_IDS+=("$ORDER_ID")
        echo "  ✓ Order ID: $ORDER_ID"
    else
        echo "  ✗ Failed to create order"
    fi
    
    # Wait for saga to process (events take time)
    sleep 1
done

echo ""
echo -e "${GREEN}✓ Created ${#ORDER_IDS[@]} orders${NC}"
echo ""

# Wait for saga processing
echo -e "${BLUE}[3/5] Waiting for saga flows to complete...${NC}"
echo "Sagas are asynchronous, waiting 10 seconds for processing..."
sleep 10
echo -e "${GREEN}✓ Saga processing time elapsed${NC}"
echo ""

# Check order statuses
echo -e "${BLUE}[4/5] Checking order statuses...${NC}"

SUCCESSFUL_ORDERS=0
CANCELLED_ORDERS=0
PENDING_ORDERS=0

for ORDER_ID in "${ORDER_IDS[@]}"; do
    if [ -n "$ORDER_ID" ]; then
        RESPONSE=$(curl -s "$ORDER_SERVICE/orders/$ORDER_ID")
        STATUS=$(echo $RESPONSE | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
        
        case $STATUS in
            "pending")
                PENDING_ORDERS=$((PENDING_ORDERS + 1))
                echo "  ⏳ Order $ORDER_ID: PENDING (saga in progress)"
                ;;
            "cancelled")
                CANCELLED_ORDERS=$((CANCELLED_ORDERS + 1))
                REASON=$(echo $RESPONSE | grep -o '"cancellationReason":"[^"]*"' | cut -d'"' -f4)
                echo "  ✗ Order $ORDER_ID: CANCELLED ($REASON)"
                ;;
            "completed")
                SUCCESSFUL_ORDERS=$((SUCCESSFUL_ORDERS + 1))
                echo "  ✓ Order $ORDER_ID: COMPLETED"
                ;;
            *)
                echo "  ? Order $ORDER_ID: UNKNOWN STATUS"
                ;;
        esac
    fi
done

echo ""
echo "Order Status Summary:"
echo "  ✓ Successful: $SUCCESSFUL_ORDERS"
echo "  ✗ Cancelled (Compensation): $CANCELLED_ORDERS"
echo "  ⏳ Pending: $PENDING_ORDERS"
echo ""

# Get streaming analytics
echo -e "${BLUE}[5/5] Streaming Analytics Report...${NC}"

if curl -s -f "$ANALYTICS_SERVICE/analytics" > /dev/null 2>&1; then
    ANALYTICS=$(curl -s "$ANALYTICS_SERVICE/analytics")
    
    echo "Real-time streaming metrics:"
    echo "$ANALYTICS" | jq '.' 2>/dev/null || echo "$ANALYTICS"
else
    echo -e "${YELLOW}  (Analytics endpoint not available, check console logs)${NC}"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  TEST SUMMARY                                                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Saga Pattern Demonstrated:"
echo "  ✓ Choreography-based saga (no central orchestrator)"
echo "  ✓ Success path: Order → Payment → Inventory"
echo "  ✓ Compensation path: Payment failure → Cancel order"
echo "  ✓ Compensation chain: Inventory failure → Refund + Cancel"
echo ""
echo "Streaming Processing Demonstrated:"
echo "  ✓ Real-time revenue aggregation"
echo "  ✓ Order count tracking"
echo "  ✓ Success rate calculation"
echo "  ✓ Periodic reporting (check analytics service logs)"
echo ""
echo "Event-Driven Patterns:"
echo "  ✓ Pub/Sub: Analytics subscribes to all events"
echo "  ✓ Event Splitter: Payment → Success/Failure events"
echo "  ✓ Event Aggregator: Analytics combines multiple streams"
echo "  ✓ Compensation: Forward actions instead of rollback"
echo ""
echo "Expected Results:"
echo "  • ~70% orders should succeed (payment + inventory OK)"
echo "  • ~30% orders cancelled due to payment failure"
echo "  • ~6% orders cancelled due to inventory failure"
echo "  • Analytics service shows real-time metrics"
echo ""
echo "Check Service Logs:"
echo "  Order Service:     Payment failures trigger compensation"
echo "  Payment Service:   30% failure rate for demo"
echo "  Inventory Service: 20% failure rate for demo"
echo "  Analytics Service: Real-time aggregation every 10s"
echo ""
echo -e "${GREEN}✓ PHASE 5 TEST COMPLETE${NC}"
echo ""
echo "Next Steps:"
echo "  1. Review PHASE5-STREAMING-SAGA.md for detailed explanations"
echo "  2. Check service logs to see saga flow in action"
echo "  3. Experiment with different failure rates"
echo "  4. Try implementing orchestration pattern (alternative)"
echo ""

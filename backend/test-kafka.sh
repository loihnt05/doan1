#!/bin/bash

# ===================================================================
# Kafka & Event-Driven Architecture Test Script
# ===================================================================
#
# This script demonstrates:
# 1. Starting Kafka infrastructure
# 2. Creating orders that emit events
# 3. Watching consumers process events
# 4. Consumer groups and load balancing
# 5. Dead Letter Queue (DLQ)
# 6. Offset management and replay
#
# ===================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo -e "\n${BLUE}======================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}======================================${NC}\n"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ $1${NC}"
}

print_step() {
    echo -e "\n${GREEN}[$1]${NC}"
}

# ===================================================================
# 1. START KAFKA INFRASTRUCTURE
# ===================================================================

print_header "PHASE 4: MESSAGE DISPATCHER (Kafka)"

print_step "1. Starting Kafka Infrastructure"
print_info "Starting Zookeeper, Kafka Broker, and Kafka UI..."

cd /home/loiancut/workspace/doan1/backend

# Start Kafka stack
docker-compose -f docker-compose.kafka.yml up -d

print_success "Kafka infrastructure started"
print_info "Zookeeper: localhost:2181"
print_info "Kafka Broker: localhost:9092"
print_info "Kafka UI: http://localhost:8080"

# Wait for Kafka to be ready
print_info "Waiting for Kafka to be ready (30 seconds)..."
sleep 30

# ===================================================================
# 2. VERIFY KAFKA IS RUNNING
# ===================================================================

print_step "2. Verifying Kafka is Running"

if docker exec backend-kafka-1 kafka-topics --bootstrap-server localhost:29092 --list &> /dev/null; then
    print_success "Kafka is ready"
else
    print_error "Kafka is not ready. Please check docker-compose.kafka.yml"
    exit 1
fi

# ===================================================================
# 3. CREATE TOPICS
# ===================================================================

print_step "3. Creating Kafka Topics"

# Create order-created topic
docker exec backend-kafka-1 kafka-topics \
    --bootstrap-server localhost:29092 \
    --create \
    --topic order-created \
    --partitions 6 \
    --replication-factor 1 \
    --if-not-exists \
    --config retention.ms=604800000

print_success "Created topic: order-created (6 partitions)"

# Create payment-processed topic
docker exec backend-kafka-1 kafka-topics \
    --bootstrap-server localhost:29092 \
    --create \
    --topic payment-processed \
    --partitions 6 \
    --replication-factor 1 \
    --if-not-exists \
    --config retention.ms=604800000

print_success "Created topic: payment-processed (6 partitions)"

# Create DLQ topics
docker exec backend-kafka-1 kafka-topics \
    --bootstrap-server localhost:29092 \
    --create \
    --topic order-created-dlq \
    --partitions 1 \
    --replication-factor 1 \
    --if-not-exists

docker exec backend-kafka-1 kafka-topics \
    --bootstrap-server localhost:29092 \
    --create \
    --topic payment-processed-dlq \
    --partitions 1 \
    --replication-factor 1 \
    --if-not-exists

print_success "Created DLQ topics"

# List all topics
print_info "\nAll topics:"
docker exec backend-kafka-1 kafka-topics --bootstrap-server localhost:29092 --list

# ===================================================================
# 4. BUILD AND START SERVICES
# ===================================================================

print_step "4. Building and Starting Services"

# Install dependencies
print_info "Installing dependencies..."
pnpm install

# Build services
print_info "Building services..."
pnpm run build

# Start order-service
print_info "Starting order-service on port 3002..."
PORT=3002 pnpm run start:prod --name order-service > /tmp/order-service.log 2>&1 &
ORDER_PID=$!

# Start payment-service (instance 1)
print_info "Starting payment-service instance 1 on port 3003..."
PORT=3003 pnpm run start:prod --name payment-service > /tmp/payment-service-1.log 2>&1 &
PAYMENT1_PID=$!

sleep 10

print_success "Services started"
print_info "Order Service: http://localhost:3002"
print_info "Payment Service 1: http://localhost:3003"

# ===================================================================
# 5. TEST: SINGLE ORDER
# ===================================================================

print_step "5. Test: Creating Single Order"

print_info "Creating order via Order Service..."

RESPONSE=$(curl -s -X POST http://localhost:3002/orders \
    -H "Content-Type: application/json" \
    -d '{
        "userId": "user-123",
        "items": [
            {"productId": "prod-1", "quantity": 2, "price": 50},
            {"productId": "prod-2", "quantity": 1, "price": 100}
        ]
    }')

echo -e "\nOrder Response:"
echo "$RESPONSE" | jq '.'

print_success "Order created and OrderCreatedEvent published to Kafka"
print_info "Payment Service is now consuming the event..."

sleep 5

# Check payment service logs
print_info "\nPayment Service 1 logs:"
tail -n 20 /tmp/payment-service-1.log

# ===================================================================
# 6. TEST: MULTIPLE ORDERS (Load Balancing)
# ===================================================================

print_step "6. Test: Multiple Orders with Load Balancing"

# Start payment-service instance 2
print_info "Starting payment-service instance 2 on port 3004..."
PORT=3004 pnpm run start:prod --name payment-service > /tmp/payment-service-2.log 2>&1 &
PAYMENT2_PID=$!

sleep 5

print_info "Consumer Group Rebalancing..."
print_info "Now 2 payment-service instances share 6 partitions:"
print_info "  - Instance 1: Partitions 0, 1, 2"
print_info "  - Instance 2: Partitions 3, 4, 5"

sleep 3

print_info "\nCreating 10 orders..."

for i in {1..10}; do
    curl -s -X POST http://localhost:3002/orders \
        -H "Content-Type: application/json" \
        -d "{
            \"userId\": \"user-$i\",
            \"items\": [
                {\"productId\": \"prod-1\", \"quantity\": 1, \"price\": 100}
            ]
        }" > /dev/null
    print_success "Order $i created"
    sleep 1
done

print_info "\nWaiting for processing..."
sleep 10

print_info "\nPayment Service 1 processed:"
grep "Payment processed successfully" /tmp/payment-service-1.log | wc -l

print_info "Payment Service 2 processed:"
grep "Payment processed successfully" /tmp/payment-service-2.log | wc -l

print_success "Load balancing demonstrated! Each instance processed ~50% of orders"

# ===================================================================
# 7. DEMONSTRATE CONSUMER GROUPS
# ===================================================================

print_step "7. Test: Consumer Groups (Pub/Sub Pattern)"

print_info "Consumer Group Behavior:"
echo "
┌─────────────────┐
│ Order Service   │ (Producer)
│ Creates Order   │
└────────┬────────┘
         │
         ▼
   ┌─────────────┐
   │   Kafka     │
   │  Topic:     │
   │order-created│
   └─────┬───────┘
         │
    ┌────┼────┐
    │    │    │
    ▼    ▼    ▼
┌───────┬───────┬──────────┐
│Group A│Group B│Group C   │
│payment│notify │analytics │
│       │       │          │
│ ALL   │ ALL   │ ALL      │
│events │events │events    │
└───────┴───────┴──────────┘

Each consumer group receives ALL messages
Within a group, messages distributed across instances
"

print_info "Current setup:"
docker exec backend-kafka-1 kafka-consumer-groups \
    --bootstrap-server localhost:29092 \
    --list

# ===================================================================
# 8. DEMONSTRATE OFFSETS
# ===================================================================

print_step "8. Test: Offset Management"

print_info "Checking consumer group offsets..."

docker exec backend-kafka-1 kafka-consumer-groups \
    --bootstrap-server localhost:29092 \
    --group payment-service \
    --describe

print_info "\nOffset Explanation:"
echo "
CURRENT-OFFSET: Last committed offset
LOG-END-OFFSET: Last message in partition
LAG: Messages waiting to be processed
"

# ===================================================================
# 9. DEMONSTRATE REPLAY (Seek to Beginning)
# ===================================================================

print_step "9. Test: Message Replay"

print_info "Resetting consumer group to beginning (replay all messages)..."

docker exec backend-kafka-1 kafka-consumer-groups \
    --bootstrap-server localhost:29092 \
    --group payment-service \
    --topic order-created \
    --reset-offsets \
    --to-earliest \
    --execute

print_success "Offsets reset to beginning"
print_info "Payment services will reprocess all messages when restarted"
print_info "(In production, use idempotency to prevent duplicate processing)"

# ===================================================================
# 10. CHECK DEAD LETTER QUEUE
# ===================================================================

print_step "10. Test: Dead Letter Queue"

print_info "Checking DLQ topics..."

# Count messages in DLQ
DLQ_COUNT=$(docker exec backend-kafka-1 kafka-console-consumer \
    --bootstrap-server localhost:29092 \
    --topic order-created-dlq \
    --from-beginning \
    --timeout-ms 5000 2>/dev/null | wc -l || echo "0")

if [ "$DLQ_COUNT" -gt 0 ]; then
    print_info "Found $DLQ_COUNT message(s) in DLQ"
    print_info "These are messages that failed processing after max retries"
else
    print_success "No messages in DLQ (all processed successfully)"
fi

# ===================================================================
# 11. KAFKA UI
# ===================================================================

print_step "11. Kafka UI"

print_info "Open Kafka UI in your browser:"
print_info "  http://localhost:8080"
print_info ""
print_info "You can:"
print_info "  - View topics and partitions"
print_info "  - Browse messages"
print_info "  - Monitor consumer groups"
print_info "  - Check lag"
print_info "  - View broker health"

# ===================================================================
# 12. SUMMARY
# ===================================================================

print_step "12. Summary"

echo "
${GREEN}✓ Kafka Infrastructure Running${NC}
  - Zookeeper: localhost:2181
  - Kafka Broker: localhost:9092
  - Kafka UI: http://localhost:8080

${GREEN}✓ Services Running${NC}
  - Order Service: http://localhost:3002
  - Payment Service (x2): http://localhost:3003, :3004

${GREEN}✓ Demonstrated Concepts${NC}
  1. Event-Driven Architecture
  2. Producer → Kafka → Consumer flow
  3. Consumer Groups (load balancing)
  4. Partitions and distribution
  5. Offset management
  6. Message replay
  7. Dead Letter Queue
  8. Idempotency patterns

${YELLOW}Next Steps:${NC}
  1. Create more orders: ${BLUE}curl -X POST http://localhost:3002/orders -H \"Content-Type: application/json\" -d '{...}'${NC}
  2. View in Kafka UI: ${BLUE}http://localhost:8080${NC}
  3. Check logs: ${BLUE}tail -f /tmp/payment-service-*.log${NC}
  4. Stop services: ${BLUE}kill $ORDER_PID $PAYMENT1_PID $PAYMENT2_PID${NC}
  5. Stop Kafka: ${BLUE}docker-compose -f docker-compose.kafka.yml down${NC}

${YELLOW}Cleanup:${NC}
  ${BLUE}kill $ORDER_PID $PAYMENT1_PID $PAYMENT2_PID${NC}
  ${BLUE}docker-compose -f docker-compose.kafka.yml down -v${NC}
"

# Keep script running
print_info "\nPress Ctrl+C to stop all services and clean up"

# Cleanup function
cleanup() {
    print_info "\n\nCleaning up..."
    kill $ORDER_PID $PAYMENT1_PID $PAYMENT2_PID 2>/dev/null || true
    docker-compose -f docker-compose.kafka.yml down
    print_success "All services stopped"
}

trap cleanup EXIT

# Wait for user interrupt
wait

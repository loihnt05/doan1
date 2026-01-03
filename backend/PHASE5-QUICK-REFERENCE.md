# Phase 5 Quick Reference Card

## 🚀 Quick Start

```bash
# 1. Start Kafka
cd backend
docker-compose -f docker-compose.kafka.yml up -d

# 2. Start all services (4 terminals)
PORT=3002 npm run start order-service
PORT=3003 npm run start payment-service
PORT=3004 npm run start inventory-service
PORT=3005 npm run start analytics-service

# 3. Run test
./test-saga.sh
```

## 📡 API Endpoints

| Service | Port | Endpoint | Method | Description |
|---------|------|----------|--------|-------------|
| Order | 3002 | `/orders` | POST | Create order (start saga) |
| Order | 3002 | `/orders/:id` | GET | Check order status |
| Analytics | 3005 | `/analytics` | GET | View real-time metrics |

## 📨 Create Order Example

```bash
curl -X POST http://localhost:3002/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "items": [
      {"productId": "prod-1", "quantity": 2, "price": 50}
    ],
    "total": 100
  }'
```

## 🔄 Saga Flow

```
Order Service → Payment Service → Inventory Service
     ↓               ↓                   ↓
OrderCreated   PaymentCompleted   InventoryReserved
                     OR                  OR
               PaymentFailed      InventoryFailed
                     ↓                   ↓
              OrderCancelled      OrderCancelled + Refund
              (COMPENSATION)      (COMPENSATION)
```

## 📊 Event Types

### Success Events
- `OrderCreatedEvent` - Saga start
- `PaymentCompletedEvent` - Payment OK
- `InventoryReservedEvent` - Items reserved

### Failure Events (Compensation Triggers)
- `PaymentFailedEvent` - Payment declined
- `InventoryFailedEvent` - Out of stock

### Compensation Events
- `OrderCancelledEvent` - Order cancelled

## 🎯 Failure Rates (Demo)

- **Payment Service**: 30% failure rate
- **Inventory Service**: 20% failure rate

**Expected Results:**
- ~70% orders succeed completely
- ~30% orders cancelled (payment failed)
- ~6% orders cancelled (inventory failed)

## 📈 Analytics Metrics

```bash
curl http://localhost:3005/analytics | jq
```

**Response:**
```json
{
  "totalOrders": 45,
  "successfulOrders": 32,
  "failedOrders": 13,
  "successRate": "71.1%",
  "totalRevenue": "3200.00",
  "ordersLastMinute": 8
}
```

## 🔍 Check Order Status

```bash
# Get order by ID
curl http://localhost:3002/orders/{orderId} | jq

# Possible statuses:
# - "pending": Saga in progress
# - "completed": Saga succeeded
# - "cancelled": Compensation applied
```

## 📚 Documentation

| File | Description |
|------|-------------|
| `PHASE5-STREAMING-SAGA.md` | Main implementation guide |
| `PHASE5-SUMMARY.md` | Implementation summary |
| `ORCHESTRATION-VS-CHOREOGRAPHY.md` | Pattern comparison |
| `test-saga.sh` | Automated test script |
| `handbook/docs/saga-pattern/` | Educational content |

## 🎓 Key Concepts

### Saga Pattern
Distributed transactions using:
- Local transactions (not distributed)
- Event coordination
- Compensation (not rollback)
- Eventually consistent

### Choreography
- Event-driven
- No central coordinator
- Services react to events
- Loose coupling

### Compensation
- Forward action (not undo)
- Cancel order (not DELETE)
- Refund payment (new transaction)
- Asynchronous

### Streaming
- Stateful processing
- Real-time aggregation
- Time windowing
- Continuous flow

## 🏗️ Service Architecture

```
Order Service (3002)
  - Saga initiator
  - Compensation handler
  - Stores order state
  
Payment Service (3003)
  - Saga participant
  - 30% failure rate
  - Emits success/failure
  
Inventory Service (3004)
  - Saga participant
  - 20% failure rate
  - Checks stock
  
Analytics Service (3005)
  - Streaming processing
  - Real-time metrics
  - Pub/sub consumer
```

## 🧪 Troubleshooting

### Services won't start
```bash
# Check Kafka is running
docker ps | grep kafka

# Check port availability
lsof -i :3002
```

### No events flowing
```bash
# Check Kafka topics
docker exec -it kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 --list

# Check consumer groups
docker exec -it kafka kafka-consumer-groups.sh \
  --bootstrap-server localhost:9092 --list
```

### Orders not cancelling
```bash
# Check order service logs
# Should show "handlePaymentFailed" calls

# Check payment failure events
docker exec -it kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic payment-failed \
  --from-beginning
```

## 📊 Monitoring

### Service Logs
```bash
# Watch order service
tail -f logs/order-service.log

# Watch analytics output
tail -f logs/analytics-service.log
```

### Kafka Topics
```bash
# List all topics
docker exec kafka kafka-topics.sh \
  --bootstrap-server localhost:9092 --list

# Consume events
docker exec kafka kafka-console-consumer.sh \
  --bootstrap-server localhost:9092 \
  --topic order-created \
  --from-beginning
```

## 🎯 Testing Checklist

- [ ] Kafka running (`docker ps`)
- [ ] All 4 services started
- [ ] Created at least 10 orders
- [ ] Some orders succeeded
- [ ] Some orders cancelled
- [ ] Analytics showing metrics
- [ ] Compensation events logged

## 💡 Quick Commands

```bash
# Start everything
docker-compose -f docker-compose.kafka.yml up -d
npm run start order-service &
npm run start payment-service &
npm run start inventory-service &
npm run start analytics-service &

# Test saga
./test-saga.sh

# View analytics
curl http://localhost:3005/analytics | jq

# Stop everything
pkill -f "nest start"
docker-compose -f docker-compose.kafka.yml down
```

## 🔗 Related Phases

- **Phase 4**: Kafka basics (pub/sub, consumer groups)
- **Phase 5**: Saga + Streaming (this phase)
- **Phase 6**: Observability (monitoring, tracing)

---

**Need help?** Check `PHASE5-STREAMING-SAGA.md` for detailed explanations.

**Want to learn more?** Read `handbook/docs/saga-pattern/` for concepts.

**See comparison?** Read `ORCHESTRATION-VS-CHOREOGRAPHY.md`.

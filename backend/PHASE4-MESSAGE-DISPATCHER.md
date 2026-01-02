# PHASE 4: MESSAGE DISPATCHER (Kafka / Event-Driven Architecture)

## 🎯 Overview

Phase 4 implements **Event-Driven Architecture** using **Apache Kafka** as a message broker. This phase demonstrates how microservices can communicate asynchronously through events instead of synchronous HTTP calls.

### Why Event-Driven Architecture?

**Problem with Request-Response (HTTP):**
```
Order Service ─HTTP POST→ Payment Service ─HTTP POST→ Notification Service
     ↓                          ↓                           ↓
  Waits...                  Waits...                    Waits...
```

**Issues:**
- **Tight Coupling**: Order service needs to know payment service URL
- **Blocking**: Order service waits for payment to complete
- **Failure Cascade**: If payment service down, order creation fails
- **Timeout Issues**: Long chain of requests can timeout
- **Scalability**: Hard to add new services without modifying existing ones

**Solution with Events (Kafka):**
```
Order Service ──event→ Kafka ──→ Payment Service (Consumer Group A)
                         ├─────→ Notification Service (Consumer Group B)
                         └─────→ Analytics Service (Consumer Group C)
     ↓
Returns immediately (non-blocking)
```

**Benefits:**
- **Loose Coupling**: Services only know about events, not each other
- **Non-Blocking**: Order service returns immediately
- **Resilient**: Events stored until consumers ready
- **Scalable**: Multiple consumers per service (load balancing)
- **Extensible**: Add new consumers without changing producers

---

## 📊 Architecture

### Component Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         KAFKA CLUSTER                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │ Zookeeper    │  │ Kafka Broker │  │  Kafka UI    │      │
│  │ :2181        │  │ :9092/29092  │  │  :8080       │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
                                ▲
                                │
                    ┌───────────┴───────────┐
                    │                       │
            ┌───────▼────────┐     ┌───────▼────────┐
            │ Order Service  │     │Payment Service │
            │  (Producer)    │     │  (Consumer)    │
            │                │     │                │
            │ POST /orders   │     │ Processes      │
            │ ↓ Publishes    │     │ payment when   │
            │ OrderCreated   │     │ event received │
            │ event          │     │                │
            └────────────────┘     └────────────────┘
```

### Event Flow

```
1. User Request
   ↓
2. Order Service creates order
   ↓
3. Order Service publishes OrderCreatedEvent to Kafka
   ↓
4. Kafka stores event (durable, replicated)
   ↓
5. Payment Service(s) consume event (load balanced across instances)
   ↓
6. Payment Service processes payment
   ↓
7. Payment Service publishes PaymentProcessedEvent
   ↓
8. Other services (notification, shipping) consume PaymentProcessedEvent
```

---

## 🔑 Key Concepts

### 1. Topics

**What**: Named channels for events. Producers send to topics, consumers read from topics.

```
order-created          ← Events about orders being created
payment-processed      ← Events about payments completing
notification-requested ← Events requesting notifications
```

**Properties:**
- **Name**: Unique identifier
- **Partitions**: Parallel processing units
- **Replication**: Fault tolerance
- **Retention**: How long to keep messages (default: 7 days)

### 2. Partitions

**What**: Subdivisions of a topic for parallelism and ordering.

```
Topic: order-created (6 partitions)
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│Partition0│Partition1│Partition2│Partition3│Partition4│Partition5│
├──────────┼──────────┼──────────┼──────────┼──────────┼──────────┤
│ Msg 0    │ Msg 1    │ Msg 2    │ Msg 3    │ Msg 4    │ Msg 5    │
│ Msg 6    │ Msg 7    │ Msg 8    │ Msg 9    │ Msg 10   │ Msg 11   │
│ Msg 12   │ Msg 13   │ Msg 14   │ Msg 15   │ Msg 16   │ Msg 17   │
└──────────┴──────────┴──────────┴──────────┴──────────┴──────────┘
```

**Key Points:**
- Messages with **same key** go to **same partition** (ordering guarantee)
- Messages with **no key** are distributed **round-robin**
- **More partitions** = **higher parallelism**
- **Consumers ≤ Partitions** for optimal distribution

**Example:**
```typescript
// Same orderId → same partition → ordering guaranteed
await producer.send(Topics.ORDER_CREATED, event, 'order-123');
await producer.send(Topics.PAYMENT_PROCESSED, event, 'order-123');
// These will be processed in order
```

### 3. Consumer Groups

**What**: A group of consumers that share consumption of a topic.

#### Pattern 1: Load Balancing (Same Consumer Group)

```
Consumer Group: payment-service

Topic: order-created (6 partitions)
┌──────────┬──────────┬──────────┬──────────┬──────────┬──────────┐
│Partition0│Partition1│Partition2│Partition3│Partition4│Partition5│
└────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┴────┬─────┘
     │          │          │          │          │          │
     └──────┬───┴──────────┴──────────┴──────┬───┴──────────┘
            │                                 │
     ┌──────▼──────┐                   ┌─────▼───────┐
     │ Payment     │                   │ Payment     │
     │ Service 1   │                   │ Service 2   │
     │ (Partitions │                   │ (Partitions │
     │  0, 1, 2)   │                   │  3, 4, 5)   │
     └─────────────┘                   └─────────────┘

Each message processed by ONE instance (work distribution)
```

#### Pattern 2: Pub/Sub (Different Consumer Groups)

```
Topic: order-created
┌─────────────────┐
│ All Messages    │
└────────┬────────┘
         │
    ┌────┼────┬────┐
    │    │    │    │
    ▼    ▼    ▼    ▼
┌─────┬─────┬──────┬──────────┐
│Grp A│Grp B│Grp C │Grp D     │
│pay- │noti-│analy-│audit     │
│ment │fy   │tics  │          │
│     │     │      │          │
│ ALL │ ALL │ ALL  │ ALL      │
└─────┴─────┴──────┴──────────┘

Each consumer group receives ALL messages (pub/sub)
```

### 4. Offsets

**What**: Sequential ID of each message in a partition.

```
Partition 0:
┌────┬────┬────┬────┬────┬────┬────┐
│ 0  │ 1  │ 2  │ 3  │ 4  │ 5  │ 6  │ ← Offsets
└────┴────┴────┴────┴────┴────┴────┘
            ▲         ▲
            │         └─ Current offset (consumer at offset 4)
            └─ Last committed offset (3)
```

**Offset Management:**
- **Auto-commit**: Offsets committed automatically (default every 5s)
- **Manual commit**: Full control over when to commit
- **On rebalance**: Offsets committed when consumer leaves/joins

**Delivery Semantics:**

1. **At-Most-Once** (commit before processing):
   ```
   Read message → Commit offset → Process
   If crash during process → Message lost
   ```

2. **At-Least-Once** (commit after processing) ← **Default**:
   ```
   Read message → Process → Commit offset
   If crash before commit → Message redelivered
   ```

3. **Exactly-Once** (transactions):
   ```
   Read message → Process + Commit in transaction
   Most complex, highest guarantee
   ```

### 5. Dead Letter Queue (DLQ)

**What**: Separate topic for messages that fail processing.

```
order-created (main topic)
     ↓
Try process
     ↓
  Failed? ─No→ Success ✓
     │
    Yes
     ↓
Retry 1 ─Success?─No→ Retry 2 ─Success?─No→ Retry 3
     │                   │                   │
    Yes                 Yes                 No
     ↓                   ↓                   ↓
  Success ✓          Success ✓       order-created-dlq
                                      (Dead Letter Queue)
```

**Use Cases:**
- Invalid message format
- Business logic errors
- Repeated failures
- Poison messages

**Best Practices:**
- Monitor DLQ size
- Alert on DLQ messages
- Investigate and fix root cause
- Manually replay after fix

---

## 🏗️ Implementation

### File Structure

```
backend/
├── docker-compose.kafka.yml          # Kafka infrastructure
├── test-kafka.sh                      # Demonstration script
└── libs/
    └── kafka/
        ├── index.ts                   # Exports
        ├── kafka.module.ts            # NestJS module
        ├── kafka.client.ts            # Connection factory
        ├── kafka-producer.service.ts  # Producer wrapper
        ├── kafka-consumer.service.ts  # Consumer wrapper
        └── events.types.ts            # Event definitions
```

### 1. Kafka Infrastructure

**docker-compose.kafka.yml:**
```yaml
services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    ports:
      - "2181:2181"
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181

  kafka:
    image: confluentinc/cp-kafka:7.5.0
    ports:
      - "9092:9092"
    environment:
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      KAFKA_NUM_PARTITIONS: 3

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    ports:
      - "8080:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka:29092
```

**Start Kafka:**
```bash
docker-compose -f docker-compose.kafka.yml up -d
```

### 2. Event Types

**libs/kafka/events.types.ts:**
```typescript
export const Topics = {
  ORDER_CREATED: 'order-created',
  PAYMENT_PROCESSED: 'payment-processed',
  ORDER_CREATED_DLQ: 'order-created-dlq',
} as const;

export const ConsumerGroups = {
  PAYMENT_SERVICE: 'payment-service',
  NOTIFICATION_SERVICE: 'notification-service',
} as const;

export interface OrderCreatedEvent {
  eventType: 'OrderCreated';
  eventId: string;
  timestamp: string;
  orderId: string;
  userId: string;
  items: Array<{ productId: string; quantity: number; price: number }>;
  total: number;
}
```

### 3. Producer (Order Service)

**apps/order-service/src/order-service.service.ts:**
```typescript
import { KafkaProducerService } from '../../../libs/kafka';
import { Topics, OrderCreatedEvent } from '../../../libs/kafka';

@Injectable()
export class OrderServiceService {
  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  async createOrder(orderDto) {
    // 1. Create order
    const order = { id: uuidv4(), ...orderDto };
    
    // 2. Create event
    const event: OrderCreatedEvent = {
      eventType: 'OrderCreated',
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      orderId: order.id,
      userId: order.userId,
      items: order.items,
      total: order.total,
    };
    
    // 3. Publish to Kafka
    await this.kafkaProducer.send(
      Topics.ORDER_CREATED,
      event,
      order.id, // key = orderId (ensures ordering)
    );
    
    return order;
  }
}
```

### 4. Consumer (Payment Service)

**apps/payment-service/src/payment-service.service.ts:**
```typescript
import { KafkaConsumerService } from '../../../libs/kafka';
import { Topics, ConsumerGroups, OrderCreatedEvent } from '../../../libs/kafka';

@Injectable()
export class PaymentServiceService implements OnModuleInit {
  constructor(private readonly kafkaConsumer: KafkaConsumerService) {}

  async onModuleInit() {
    // Subscribe to order-created events
    await this.kafkaConsumer.subscribe<OrderCreatedEvent>(
      ConsumerGroups.PAYMENT_SERVICE,
      [Topics.ORDER_CREATED],
      this.handleOrderCreated.bind(this),
      {
        maxRetries: 3,
        fromBeginning: false,
        autoCommit: true,
        sendToDlqOnFailure: true,
      },
    );
  }

  private async handleOrderCreated(event: OrderCreatedEvent, metadata) {
    console.log('Processing payment for order', event.orderId);
    
    // Process payment
    await this.processPayment(event);
    
    console.log('Payment processed successfully');
  }
}
```

---

## 🧪 Testing

### Run Test Script

```bash
cd backend
./test-kafka.sh
```

**What it does:**
1. ✓ Starts Kafka infrastructure
2. ✓ Creates topics with partitions
3. ✓ Builds and starts services
4. ✓ Creates orders (produces events)
5. ✓ Watches payment processing (consumes events)
6. ✓ Demonstrates load balancing with multiple consumers
7. ✓ Shows consumer group behavior
8. ✓ Displays offset management
9. ✓ Checks Dead Letter Queue

### Manual Testing

#### 1. Start Kafka:
```bash
docker-compose -f docker-compose.kafka.yml up -d
```

#### 2. Create a topic:
```bash
docker exec backend-kafka-1 kafka-topics \
  --bootstrap-server localhost:29092 \
  --create --topic order-created \
  --partitions 6 --replication-factor 1
```

#### 3. Start Order Service:
```bash
PORT=3002 pnpm run start:prod
```

#### 4. Start Payment Service:
```bash
PORT=3003 pnpm run start:prod
```

#### 5. Create an order:
```bash
curl -X POST http://localhost:3002/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user-123",
    "items": [
      {"productId": "prod-1", "quantity": 2, "price": 50}
    ]
  }'
```

#### 6. View in Kafka UI:
```
Open: http://localhost:8080
Navigate: Topics → order-created → Messages
```

---

## 📈 Performance Comparison

### Synchronous (HTTP)

```
Order Service ──HTTP→ Payment Service
     ↓                     ↓
  Waits...            Processes
     ↓                     ↓
 Response ←─────────────────┘

Total Time: 2000ms + network latency
```

### Asynchronous (Kafka)

```
Order Service ──Event→ Kafka
     ↓                    │
Returns immediately       │
(100ms)                   ├──→ Payment Service (processes in background)
                          ├──→ Notification Service
                          └──→ Analytics Service

Response Time: 100ms (20x faster!)
Total Processing: Parallel, non-blocking
```

**Throughput Comparison:**

| Metric | HTTP (Sync) | Kafka (Async) |
|--------|-------------|---------------|
| Response Time | 2000ms | 100ms |
| Orders/sec | 50 | 1000+ |
| Failure Impact | Cascading | Isolated |
| Scalability | Limited | Horizontal |

---

## 🔧 Configuration

### Producer Configuration

```typescript
await producer.send({
  topic: 'order-created',
  messages: [{ key: 'order-123', value: JSON.stringify(event) }],
  acks: 1,           // 0=no wait, 1=leader, -1=all replicas
  timeout: 30000,    // Request timeout
  compression: 'gzip', // Compression (gzip, snappy, lz4)
});
```

**acks levels:**
- `0`: Fire and forget (fastest, no guarantee)
- `1`: Leader acknowledgment (default, balanced)
- `-1`: All replicas (safest, slowest)

### Consumer Configuration

```typescript
await consumer.subscribe({
  topics: ['order-created'],
  fromBeginning: false,  // Start from latest or earliest
});

await consumer.run({
  autoCommit: true,              // Auto-commit offsets
  autoCommitInterval: 5000,      // Commit every 5s
  sessionTimeout: 30000,         // Max time between heartbeats
  heartbeatInterval: 3000,       // Heartbeat frequency
  maxBytesPerPartition: 1048576, // Max bytes per fetch
});
```

---

## 🎯 Best Practices

### 1. Event Design

✅ **Good Event Names** (past tense):
- `OrderCreated`
- `PaymentProcessed`
- `UserRegistered`

❌ **Bad Event Names**:
- `CreateOrder` (command, not event)
- `Order` (too generic)
- `ProcessPayment` (command)

✅ **Include Context**:
```typescript
{
  eventId: 'unique-id',        // For idempotency
  timestamp: '2024-01-...',    // When it happened
  orderId: 'order-123',        // Entity ID
  userId: 'user-456',          // Related entities
  // ... event-specific data
}
```

### 2. Partitioning Strategy

✅ **Use Entity ID as Key**:
```typescript
// All events for same order go to same partition
await producer.send(topic, event, orderId);
```

This guarantees:
- `OrderCreated` → Partition 3
- `PaymentProcessed` → Partition 3 (same key)
- `OrderShipped` → Partition 3 (ordering preserved)

### 3. Idempotency

**Problem**: Consumer crashes after processing but before committing offset.
**Result**: Message redelivered and processed twice.
**Solution**: Idempotency check.

```typescript
async handleEvent(event) {
  // Check if already processed
  if (await this.isProcessed(event.eventId)) {
    return; // Skip duplicate
  }
  
  // Process event
  await this.process(event);
  
  // Mark as processed
  await this.markProcessed(event.eventId);
}
```

**Storage Options:**
- **Redis**: Fast, TTL support
- **Database**: Durable, with unique constraint
- **Kafka Transactions**: Built-in exactly-once

### 4. Error Handling

```typescript
async handleEvent(event) {
  let retries = 0;
  
  while (retries < MAX_RETRIES) {
    try {
      await this.process(event);
      return; // Success
    } catch (error) {
      if (isTransientError(error)) {
        retries++;
        await sleep(Math.pow(2, retries) * 1000); // Exponential backoff
      } else {
        await this.sendToDLQ(event, error);
        return; // Permanent error, don't retry
      }
    }
  }
  
  // Max retries exceeded
  await this.sendToDLQ(event, 'Max retries exceeded');
}
```

**Transient Errors** (retry):
- Network timeout
- Database connection lost
- External API unavailable

**Permanent Errors** (DLQ):
- Invalid data format
- Business rule violation
- Data not found

### 5. Monitoring

**Key Metrics:**
- **Consumer Lag**: Messages waiting to be processed
- **DLQ Size**: Failed messages
- **Processing Time**: Time to process message
- **Error Rate**: Percentage of failed messages

**Kafka UI** (http://localhost:8080):
- View topics and partitions
- Monitor consumer groups
- Check lag
- Browse messages
- View broker health

**CLI Commands:**
```bash
# List topics
docker exec backend-kafka-1 kafka-topics --bootstrap-server localhost:29092 --list

# Describe consumer group
docker exec backend-kafka-1 kafka-consumer-groups \
  --bootstrap-server localhost:29092 \
  --group payment-service \
  --describe

# View messages
docker exec backend-kafka-1 kafka-console-consumer \
  --bootstrap-server localhost:29092 \
  --topic order-created \
  --from-beginning
```

---

## 🚀 Advanced Patterns

### 1. Transactional Outbox

**Problem**: Order saved to DB, but Kafka publish fails.
**Result**: Order exists but no payment processing.

**Solution**: Transactional Outbox Pattern
```typescript
// 1. Save order + event in single DB transaction
await db.transaction(async (tx) => {
  await tx.orders.create(order);
  await tx.outbox.create({ event, status: 'pending' });
});

// 2. Background job polls outbox table
setInterval(async () => {
  const pending = await db.outbox.findAll({ status: 'pending' });
  for (const item of pending) {
    await kafkaProducer.send(item.topic, item.event);
    await db.outbox.update(item.id, { status: 'published' });
  }
}, 1000);
```

### 2. Saga Pattern

**Problem**: Distributed transactions across services.
**Example**: Order → Payment → Inventory → Shipping

**Solution**: Choreography-based Saga
```
OrderCreated → PaymentService → PaymentProcessed
                                      ↓
                                 InventoryService → InventoryReserved
                                                         ↓
                                                    ShippingService → OrderShipped

If any step fails:
  PaymentFailed → RollbackOrder
  InventoryFailed → RefundPayment
```

### 3. Event Sourcing

**Concept**: Store all changes as events, not just current state.

```typescript
// Traditional (state-based)
Order { id: 1, status: 'shipped', total: 100 }

// Event Sourcing (event-based)
OrderCreated { orderId: 1, total: 100 }
PaymentProcessed { orderId: 1, amount: 100 }
OrderShipped { orderId: 1, trackingId: 'ABC123' }

// Rebuild current state by replaying events
```

### 4. CQRS (Command Query Responsibility Segregation)

**Concept**: Separate write model (commands) from read model (queries).

```
Write Side (Commands):
  CreateOrder → order-created event → Kafka

Read Side (Queries):
  order-created event → Update read DB (optimized for queries)
```

**Benefits:**
- Optimized read/write models
- Independent scaling
- Multiple read models from same events

---

## 📚 Kafka CLI Cheatsheet

### Topics

```bash
# Create topic
kafka-topics --create --topic my-topic --partitions 6 --replication-factor 1

# List topics
kafka-topics --list

# Describe topic
kafka-topics --describe --topic my-topic

# Delete topic
kafka-topics --delete --topic my-topic
```

### Producer

```bash
# Produce messages (interactive)
kafka-console-producer --topic my-topic

# With key
kafka-console-producer --topic my-topic --property "parse.key=true" --property "key.separator=:"
```

### Consumer

```bash
# Consume from beginning
kafka-console-consumer --topic my-topic --from-beginning

# Consume latest
kafka-console-consumer --topic my-topic

# With consumer group
kafka-console-consumer --topic my-topic --group my-group
```

### Consumer Groups

```bash
# List groups
kafka-consumer-groups --list

# Describe group
kafka-consumer-groups --group my-group --describe

# Reset offsets to beginning
kafka-consumer-groups --group my-group --topic my-topic --reset-offsets --to-earliest --execute

# Reset to specific offset
kafka-consumer-groups --group my-group --topic my-topic:0 --reset-offsets --to-offset 100 --execute
```

---

## 🎓 Summary

### What We Built

✅ **Kafka Infrastructure**
- Zookeeper (coordination)
- Kafka Broker (message storage)
- Kafka UI (monitoring)

✅ **Event-Driven Architecture**
- Producer (Order Service)
- Consumer (Payment Service)
- Event Types (strongly typed)

✅ **Advanced Features**
- Consumer Groups (load balancing)
- Partitions (parallelism + ordering)
- Offsets (delivery guarantees)
- Dead Letter Queue (error handling)
- Idempotency (duplicate prevention)

### Key Takeaways

1. **Event-Driven vs Request-Response**
   - Async vs Sync
   - Loose coupling vs Tight coupling
   - Resilient vs Brittle

2. **Kafka Core Concepts**
   - Topics: Channels for events
   - Partitions: Parallel processing + ordering
   - Consumer Groups: Load balancing + pub/sub
   - Offsets: Position tracking

3. **Delivery Semantics**
   - At-Most-Once: Fast, may lose
   - At-Least-Once: Safe, may duplicate (default)
   - Exactly-Once: Complex, no duplicates

4. **Best Practices**
   - Use entity ID as partition key
   - Implement idempotency
   - Monitor consumer lag
   - Use DLQ for failures
   - Plan for rebalancing

### Next Steps

1. **Add More Consumers**: Notification Service, Analytics Service
2. **Implement CQRS**: Separate read/write models
3. **Add Event Sourcing**: Store all events
4. **Implement Saga Pattern**: Distributed transactions
5. **Add Monitoring**: Prometheus + Grafana
6. **Production Setup**: Multiple brokers, replication, monitoring

---

## 📖 Resources

- [Apache Kafka Documentation](https://kafka.apache.org/documentation/)
- [KafkaJS (Node.js Client)](https://kafka.js.org/)
- [Kafka: The Definitive Guide](https://www.confluent.io/resources/kafka-the-definitive-guide/)
- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
- [Saga Pattern](https://microservices.io/patterns/data/saga.html)

---

**Phase 4 Complete!** 🎉

Event-driven architecture implemented with:
- Asynchronous messaging
- Load balancing with consumer groups
- Fault tolerance with DLQ
- Delivery guarantees with offsets
- Comprehensive documentation and demonstrations

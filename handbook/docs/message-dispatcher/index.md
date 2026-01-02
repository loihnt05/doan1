# Message Dispatcher (Bộ Phân Phối Tin Nhắn)

## Tổng Quan

Message Dispatcher (còn gọi là Message Broker hoặc Message Queue) là middleware cho phép giao tiếp bất đồng bộ giữa các dịch vụ bằng cách định tuyến tin nhắn từ producer đến consumer. Nó rất quan trọng để xây dựng kiến trúc microservices hướng sự kiện, có khả năng mở rộng và tách rời.

## Tại Sao Cần Message Dispatcher?

### Không Có Message Dispatcher (Đồng Bộ)
```
Order Service ──HTTP──> Payment Service
                          ↓ (nếu down)
                         Order thất bại!
```

### Có Message Dispatcher (Bất Đồng Bộ)
```
Order Service ──> Message Queue ──> Payment Service
     ↓                               (có thể down)
    Trả về                       Queue lưu tin nhắn
   ngay lập tức                    cho đến khi service phục hồi
```

**Lợi Ích:**
- **Tách Rời**: Các service không cần biết về nhau
- **Độ Tin Cậy**: Tin nhắn không bị mất nếu consumer down
- **Khả Năng Mở Rộng**: Dễ dàng thêm consumer
- **Khả Năng Phục Hồi**: Lỗi được cô lập, có thể retry
- **Xử Lý Bất Đồng Bộ**: Không chặn khi chờ phản hồi

## Cấu Trúc Tài Liệu

Hướng dẫn này bao gồm các khái niệm và triển khai message dispatcher:

### Khái Niệm Cơ Bản
- **[Message Brokers](./message-brokers.md)** - Producer, consumer, các loại broker (Kafka, RabbitMQ, Redis, AWS SQS/SNS)
- **[Topics & Exchanges](./topics-exchanges.md)** - Cơ chế định tuyến: direct, fanout, topic, và headers exchanges
- **[Consumer Groups](./consumer-groups.md)** - Xử lý song song, phân bổ partition, các mẫu mở rộng

### Độ Tin Cậy & Phân Phối
- **[Delivery Semantics](./delivery-semantics.md)** - Đảm bảo at-most-once, at-least-once, exactly-once

## Core Concepts

### 1. Message Broker

Central system that receives, stores, and delivers messages.

**Popular brokers:**
- **Apache Kafka**: High-throughput, distributed streaming
- **RabbitMQ**: Traditional message queuing
- **AWS SQS/SNS**: Managed cloud services
- **Redis Streams**: Lightweight alternative

### 2. Producer

Service that sends messages to the broker.

```typescript
@Injectable()
export class OrderService {
  constructor(
    @Inject('KAFKA_PRODUCER') private kafka: ClientKafka
  ) {}

  async createOrder(orderData: CreateOrderDto) {
    // Save to database
    const order = await this.orderRepository.save(orderData);

    // Publish event (fire and forget)
    await this.kafka.emit('order-created', {
      orderId: order.id,
      userId: order.userId,
      amount: order.amount,
      timestamp: Date.now()
    });

    return order;
  }
}
```

### 3. Consumer

Service that receives and processes messages.

```typescript
@Controller()
export class PaymentConsumer {
  @EventPattern('order-created')
  async handleOrderCreated(data: OrderCreatedEvent) {
    console.log(`Processing order ${data.orderId}`);

    try {
      // Process payment
      await this.paymentService.processPayment(data);

      // Emit success event
      await this.kafka.emit('payment-processed', {
        orderId: data.orderId,
        status: 'success'
      });
    } catch (error) {
      // Emit failure event
      await this.kafka.emit('payment-failed', {
        orderId: data.orderId,
        error: error.message
      });
    }
  }
}
```

### 4. Message Queue vs Topic

#### Queue (Point-to-Point)
```
Producer → Queue → Consumer 1
                   (only one gets it)
                   
Consumer 2 → (waits for next message)
```

**Use case:** Work distribution (multiple workers processing jobs)

#### Topic (Publish-Subscribe)
```
Producer → Topic → Consumer 1 (gets copy)
               ├→ Consumer 2 (gets copy)
               └→ Consumer 3 (gets copy)
```

**Use case:** Event broadcasting (multiple services react to same event)

## Exchange Types (RabbitMQ)

### 1. Direct Exchange

Route based on exact routing key match.

```typescript
// Producer
await channel.publish('direct-exchange', 'order.created', message);

// Consumer 1 - listens to 'order.created'
await channel.bindQueue(queue1, 'direct-exchange', 'order.created');

// Consumer 2 - listens to 'order.cancelled'
await channel.bindQueue(queue2, 'direct-exchange', 'order.cancelled');
```

```
Producer ──'order.created'──> Exchange ──> Queue 1 → Consumer 1
                                      (no match)
                                       ✗ ──> Queue 2 → Consumer 2
```

### 2. Fanout Exchange

Broadcast to all bound queues (ignores routing key).

```typescript
// Broadcast to all
await channel.publish('fanout-exchange', '', message);
```

```
Producer ──> Fanout Exchange ──┬──> Queue 1 → Consumer 1
                               ├──> Queue 2 → Consumer 2
                               └──> Queue 3 → Consumer 3
                               (all receive message)
```

**Use case:** Notifications, logging, analytics

### 3. Topic Exchange

Route based on pattern matching.

```typescript
// Producer
await channel.publish('topic-exchange', 'order.us.created', message);

// Consumer patterns
await channel.bindQueue(queue1, 'topic-exchange', 'order.*.created');  // Matches
await channel.bindQueue(queue2, 'topic-exchange', 'order.us.*');        // Matches
await channel.bindQueue(queue3, 'topic-exchange', 'payment.*');         // No match
```

**Wildcards:**
- `*`: Matches exactly one word
- `#`: Matches zero or more words

```
'order.*.created'  matches  'order.us.created'
'order.#'          matches  'order.us.created.bulk'
```

### 4. Headers Exchange

Route based on message headers (not routing key).

```typescript
// Producer
await channel.publish('headers-exchange', '', message, {
  headers: {
    format: 'pdf',
    priority: 'high'
  }
});

// Consumer
await channel.bindQueue(queue, 'headers-exchange', '', {
  'x-match': 'all',  // or 'any'
  'format': 'pdf',
  'priority': 'high'
});
```

## Consumer Groups

Multiple consumers in same group share message processing.

```
Topic: order-created (6 partitions)

Consumer Group A:
  Consumer 1 → Partition 0, 1
  Consumer 2 → Partition 2, 3
  Consumer 3 → Partition 4, 5

Consumer Group B:
  Consumer 1 → Partition 0, 1, 2
  Consumer 2 → Partition 3, 4, 5
```

**Key Points:**
- Within group: Each message consumed by only ONE consumer
- Across groups: Each group gets ALL messages
- Enables parallel processing + multiple subscribers

```typescript
// NestJS Kafka Consumer Group
@Module({
  imports: [
    ClientsModule.register([{
      name: 'KAFKA_SERVICE',
      transport: Transport.KAFKA,
      options: {
        client: {
          brokers: ['localhost:9092']
        },
        consumer: {
          groupId: 'payment-service-group', // All instances share this
        }
      }
    }])
  ]
})
```

## Delivery Semantics

### At-Most-Once

Message may be lost but never delivered twice.

```typescript
// No acknowledgment checking
@EventPattern('order-created')
async handleOrder(data: any) {
  // Process immediately, no retry if fails
  await this.processOrder(data);
  // Auto-ack before processing
}
```

**Use case:** Logs, metrics (losing some data is acceptable)

### At-Least-Once

Message never lost but may be delivered multiple times.

```typescript
// Manual acknowledgment after processing
@EventPattern('order-created')
async handleOrder(data: any, context: KafkaContext) {
  try {
    await this.processOrder(data);
    context.commit(); // Ack after successful processing
  } catch (error) {
    // Don't ack, will be retried
    throw error;
  }
}
```

**Use case:** Most applications (handle duplicates with idempotency)

### Exactly-Once

Message delivered exactly one time (hardest to achieve).

```typescript
// Use transactional outbox pattern
@EventPattern('order-created')
async handleOrder(data: any) {
  await this.db.transaction(async (tx) => {
    // Check if already processed (idempotency key)
    const processed = await tx.findOne(ProcessedEvents, {
      where: { eventId: data.eventId }
    });

    if (processed) {
      return; // Already processed
    }

    // Process
    await this.processOrder(data, tx);

    // Mark as processed
    await tx.save(ProcessedEvents, {
      eventId: data.eventId,
      timestamp: Date.now()
    });
  });
}
```

**Use case:** Financial transactions, critical operations

## Dead Letter Queue (DLQ)

When message processing repeatedly fails, send to DLQ for investigation.

```typescript
@Injectable()
export class MessageProcessor {
  private readonly MAX_RETRIES = 3;

  @EventPattern('order-created')
  async handleOrder(message: any, context: KafkaContext) {
    const retryCount = message.headers?.retryCount || 0;

    try {
      await this.processOrder(message.data);
      context.commit();
    } catch (error) {
      if (retryCount >= this.MAX_RETRIES) {
        // Send to DLQ
        await this.kafka.emit('order-created-dlq', {
          ...message,
          error: error.message,
          failedAt: Date.now()
        });
        
        context.commit(); // Don't retry anymore
      } else {
        // Retry with backoff
        await this.kafka.emit('order-created', {
          ...message,
          headers: { retryCount: retryCount + 1 }
        });
        
        context.commit();
      }
    }
  }

  // Monitor DLQ
  @EventPattern('order-created-dlq')
  async handleDLQ(message: any) {
    // Log to monitoring system
    console.error('Message sent to DLQ:', message);
    
    // Alert operations team
    await this.alerting.sendAlert({
      severity: 'critical',
      message: 'Message processing failed after max retries'
    });
  }
}
```

## Apache Kafka

### Architecture

```
┌─────────────────────────────────────────────────┐
│               Kafka Cluster                     │
│                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ Broker 1 │  │ Broker 2 │  │ Broker 3 │    │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘    │
│       │             │             │            │
│  ┌────▼─────────────▼─────────────▼────┐     │
│  │          Zookeeper                   │     │
│  │    (Coordination & Metadata)         │     │
│  └──────────────────────────────────────┘     │
└─────────────────────────────────────────────────┘

Topic: order-created (3 partitions, replication=2)

Partition 0: [Broker 1 Leader] [Broker 2 Replica]
Partition 1: [Broker 2 Leader] [Broker 3 Replica]
Partition 2: [Broker 3 Leader] [Broker 1 Replica]
```

### Topics & Partitions

```typescript
// Create topic with partitions
await admin.createTopics({
  topics: [{
    topic: 'order-created',
    numPartitions: 6,        // Parallel processing
    replicationFactor: 2      // Fault tolerance
  }]
});
```

**Why partitions?**
- **Parallelism**: Each partition processed independently
- **Scalability**: Distribute load across brokers
- **Ordering**: Messages in same partition are ordered

```
Topic: order-created

Partition 0: [msg1] [msg3] [msg5] → Consumer 1
Partition 1: [msg2] [msg4] [msg6] → Consumer 2
Partition 2: [msg7] [msg8] [msg9] → Consumer 3
```

### Offset Management

Kafka tracks consumer position with offsets.

```
Partition 0: [0] [1] [2] [3] [4] [5] [6]
                          ↑
                    Consumer offset = 3
                    (processed 0,1,2,3)
```

```typescript
// Manual offset commit
@EventPattern('order-created')
async handleOrder(message: any, context: KafkaContext) {
  const { partition, offset } = context.getMessage();
  
  try {
    await this.processOrder(message);
    
    // Commit offset manually
    await context.commit();
    
    console.log(`Processed partition ${partition}, offset ${offset}`);
  } catch (error) {
    // Don't commit - message will be reprocessed
    throw error;
  }
}
```

### Partitioning Strategy

```typescript
// Strategy 1: Key-based (same key → same partition)
await producer.send({
  topic: 'order-created',
  messages: [{
    key: userId,  // All messages for user go to same partition
    value: JSON.stringify(order)
  }]
});

// Strategy 2: Round-robin (default, no key)
await producer.send({
  topic: 'order-created',
  messages: [{
    value: JSON.stringify(order)  // Distributed evenly
  }]
});

// Strategy 3: Custom partitioner
await producer.send({
  topic: 'order-created',
  messages: [{
    value: JSON.stringify(order),
    partition: order.amount > 1000 ? 0 : 1  // High-value orders
  }]
});
```

## Implementation Example

### Producer Setup

```typescript
// order.module.ts
@Module({
  imports: [
    ClientsModule.register([{
      name: 'KAFKA_SERVICE',
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'order-service',
          brokers: ['localhost:9092']
        },
        producer: {
          allowAutoTopicCreation: true,
          transactionTimeout: 30000
        }
      }
    }])
  ],
  providers: [OrderService]
})
export class OrderModule {}

// order.service.ts
@Injectable()
export class OrderService {
  constructor(
    @Inject('KAFKA_SERVICE') private kafka: ClientKafka
  ) {}

  async createOrder(data: CreateOrderDto) {
    const order = await this.orderRepository.save(data);

    // Publish event
    await this.kafka.emit('order-created', {
      orderId: order.id,
      userId: order.userId,
      items: order.items,
      amount: order.amount,
      timestamp: Date.now()
    });

    return order;
  }
}
```

### Consumer Setup

```typescript
// main.ts
const app = await NestFactory.createMicroservice<MicroserviceOptions>(
  PaymentModule,
  {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: 'payment-service',
        brokers: ['localhost:9092']
      },
      consumer: {
        groupId: 'payment-consumer-group',
        sessionTimeout: 30000,
        heartbeatInterval: 3000
      }
    }
  }
);

// payment.controller.ts
@Controller()
export class PaymentController {
  @EventPattern('order-created')
  async handleOrderCreated(@Payload() data: OrderCreatedEvent) {
    console.log(`Received order: ${data.orderId}`);
    
    // Process payment
    const result = await this.paymentService.process(data);
    
    // Emit result
    await this.kafka.emit('payment-processed', result);
  }
}
```

## Best Practices

### 1. Idempotency

Ensure processing same message multiple times has same effect.

```typescript
@EventPattern('order-created')
async handleOrder(data: OrderCreatedEvent) {
  // Check if already processed
  const existing = await this.orderRepository.findOne({
    where: { externalId: data.orderId }
  });

  if (existing) {
    console.log('Order already processed');
    return;
  }

  // Process
  await this.processOrder(data);
}
```

### 2. Error Handling

```typescript
@EventPattern('order-created')
async handleOrder(data: OrderCreatedEvent) {
  try {
    await this.processOrder(data);
  } catch (error) {
    if (error instanceof ValidationError) {
      // Permanent error - send to DLQ
      await this.sendToDLQ(data, error);
    } else {
      // Temporary error - retry
      throw error;
    }
  }
}
```

### 3. Monitoring

```typescript
@Injectable()
export class KafkaMetrics {
  recordMessageProcessed(topic: string, success: boolean, duration: number) {
    this.metrics.increment('kafka_messages_total', {
      topic,
      success: success.toString()
    });

    this.metrics.observe('kafka_processing_duration', duration, {
      topic
    });
  }
}
```

## Project Implementation

See:
- [Kafka setup](../../../backend/PHASE4-MESSAGE-DISPATCHER.md)
- [Docker Compose](../../../backend/docker-compose.kafka.yml)
- [Consumer examples](../../../backend/apps/payment-service/src)
- [Test scripts](../../../backend/test-kafka.sh)

## Next Steps

- Learn about saga pattern for distributed transactions
- Explore [Streaming](../streaming-processing/index.md)
- Check event sourcing patterns

# Message Brokers

## Overview

A message broker is middleware that translates messages between formal messaging protocols, enabling applications to communicate asynchronously by sending and receiving messages through queues or topics.

## Core Concepts

### Producer

An application/service that **sends messages** to the broker.

```typescript
@Injectable()
export class OrderProducerService {
  constructor(@Inject('KAFKA_PRODUCER') private kafka: ClientKafka) {}

  async publishOrderCreated(order: Order) {
    await this.kafka.emit('order-created', {
      key: order.id,
      value: {
        orderId: order.id,
        userId: order.userId,
        amount: order.amount,
        items: order.items,
        timestamp: Date.now()
      }
    });
  }
}
```

### Consumer

An application/service that **receives and processes messages** from the broker.

```typescript
@Controller()
export class PaymentConsumer {
  @EventPattern('order-created')
  async handleOrderCreated(event: OrderCreatedEvent) {
    console.log(`Processing payment for order ${event.orderId}`);
    
    try {
      await this.paymentService.charge(event.userId, event.amount);
      
      // Emit success event
      await this.kafka.emit('payment-succeeded', {
        orderId: event.orderId,
        amount: event.amount
      });
    } catch (error) {
      // Emit failure event
      await this.kafka.emit('payment-failed', {
        orderId: event.orderId,
        reason: error.message
      });
    }
  }
}
```

### Broker

The central message routing system that:
- Receives messages from producers
- Stores messages durably
- Delivers messages to consumers
- Manages queues/topics
- Handles message persistence and replication

## Message Broker Types

### 1. Apache Kafka

**Best for:** High-throughput streaming, event sourcing, log aggregation

**Characteristics:**
- Distributed, partitioned, replicated commit log
- Very high throughput (millions of messages/sec)
- Message ordering per partition
- Persistent storage (configurable retention)
- Designed for real-time data feeds

```typescript
// kafka.module.ts
@Module({
  imports: [
    ClientsModule.register([{
      name: 'KAFKA_SERVICE',
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: 'order-service',
          brokers: ['kafka:9092'],
        },
        consumer: {
          groupId: 'order-consumer-group',
          sessionTimeout: 30000,
          heartbeatInterval: 3000,
        },
        producer: {
          idempotent: true,
          maxInFlightRequests: 5,
          transactionalId: 'order-producer',
        }
      }
    }])
  ]
})
export class KafkaModule {}
```

**Use cases:**
- Event streaming
- Activity tracking
- Log aggregation
- Real-time analytics
- CDC (Change Data Capture)

### 2. RabbitMQ

**Best for:** Traditional messaging, complex routing, task distribution

**Characteristics:**
- AMQP protocol
- Flexible routing (exchanges)
- Message acknowledgments
- Priority queues
- Message TTL (Time To Live)

```typescript
// rabbitmq.module.ts
@Module({
  imports: [
    ClientsModule.register([{
      name: 'RABBITMQ_SERVICE',
      transport: Transport.RMQ,
      options: {
        urls: ['amqp://localhost:5672'],
        queue: 'orders_queue',
        queueOptions: {
          durable: true,
          arguments: {
            'x-message-ttl': 60000,        // Message TTL: 60s
            'x-max-length': 10000,          // Max queue length
            'x-dead-letter-exchange': 'dlx' // DLQ
          }
        }
      }
    }])
  ]
})
export class RabbitMQModule {}

// Producer
@Injectable()
export class OrderProducer {
  constructor(@Inject('RABBITMQ_SERVICE') private client: ClientProxy) {}

  async sendOrder(order: Order) {
    return this.client.emit('order-created', order).toPromise();
  }
}

// Consumer
@Controller()
export class OrderConsumer {
  @EventPattern('order-created')
  handleOrder(order: Order) {
    console.log('Processing order:', order);
  }
}
```

**Use cases:**
- Task queues
- Request/reply patterns
- Work distribution
- RPC (Remote Procedure Call)

### 3. Redis Streams

**Best for:** Lightweight messaging, caching + messaging hybrid

**Characteristics:**
- In-memory with optional persistence
- Consumer groups support
- Message history
- Simpler than Kafka
- Lower latency

```typescript
// redis-streams.service.ts
@Injectable()
export class RedisStreamService {
  constructor(private redis: Redis) {}

  async produce(stream: string, data: any) {
    await this.redis.xadd(
      stream,
      '*',                    // Auto-generate ID
      'data', JSON.stringify(data)
    );
  }

  async consume(stream: string, group: string, consumer: string) {
    // Create consumer group if not exists
    try {
      await this.redis.xgroup('CREATE', stream, group, '0', 'MKSTREAM');
    } catch (error) {
      // Group already exists
    }

    while (true) {
      const messages = await this.redis.xreadgroup(
        'GROUP', group, consumer,
        'BLOCK', '0',         // Block indefinitely
        'COUNT', '10',        // Read 10 messages at a time
        'STREAMS', stream, '>'
      );

      if (messages) {
        for (const [stream, entries] of messages) {
          for (const [id, fields] of entries) {
            const data = JSON.parse(fields[1]);
            await this.processMessage(data);
            
            // Acknowledge
            await this.redis.xack(stream, group, id);
          }
        }
      }
    }
  }
}
```

**Use cases:**
- Real-time notifications
- Chat applications
- Lightweight event streaming
- Session management

### 4. AWS SQS/SNS

**Best for:** Cloud-native, managed service, AWS ecosystem

**SQS (Simple Queue Service):**
- Point-to-point messaging
- At-least-once delivery
- Standard or FIFO queues

**SNS (Simple Notification Service):**
- Pub/sub messaging
- Fan-out to multiple subscribers
- Mobile push, SMS, email

```typescript
// aws-sqs.service.ts
import { SQSClient, SendMessageCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';

@Injectable()
export class SQSService {
  private client: SQSClient;

  constructor() {
    this.client = new SQSClient({ region: 'us-east-1' });
  }

  async sendMessage(queueUrl: string, message: any) {
    const command = new SendMessageCommand({
      QueueUrl: queueUrl,
      MessageBody: JSON.stringify(message),
      MessageAttributes: {
        'Type': { DataType: 'String', StringValue: 'OrderCreated' }
      }
    });

    return this.client.send(command);
  }

  async receiveMessages(queueUrl: string) {
    const command = new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 20,      // Long polling
      VisibilityTimeout: 30
    });

    const response = await this.client.send(command);
    return response.Messages || [];
  }
}
```

**Use cases:**
- Microservices communication (AWS)
- Decoupling components
- Load leveling
- Background jobs

## Comparison

| Feature | Kafka | RabbitMQ | Redis Streams | AWS SQS |
|---------|-------|----------|---------------|---------|
| **Throughput** | Very High (1M+/s) | High (10K-100K/s) | Very High | Medium |
| **Latency** | Low (few ms) | Very Low (sub-ms) | Very Low (sub-ms) | Medium (10-100ms) |
| **Ordering** | Per partition | Per queue | Per stream | FIFO queues only |
| **Persistence** | Yes (configurable) | Yes | Optional | Yes |
| **Replication** | Built-in | Yes | Yes (Redis Cluster) | Managed |
| **Scaling** | Horizontal | Vertical + clustering | Horizontal | Managed |
| **Protocol** | Custom | AMQP | Custom | HTTP/HTTPS |
| **Message Replay** | Yes | No | Yes (history) | No |
| **Complex Routing** | No | Yes (exchanges) | No | No |
| **Management** | Self-hosted | Self-hosted | Self-hosted | Fully managed |
| **Best For** | Streaming | Messaging | Lightweight | AWS services |

## Message Patterns

### Fire and Forget

Producer sends message without waiting for confirmation.

```typescript
// Don't await - fire and forget
this.kafka.emit('log-event', { message: 'User logged in' });
```

### Request-Reply

Producer expects a response.

```typescript
// Send request
const response = await this.client.send('get-user', { userId: '123' }).toPromise();
console.log('User:', response);

// Handle request
@MessagePattern('get-user')
async getUser(data: { userId: string }) {
  return this.userService.findOne(data.userId);
}
```

### Publish-Subscribe

Multiple consumers receive same message.

```typescript
// Publisher
await this.kafka.emit('user-registered', user);

// Subscriber 1: Send email
@EventPattern('user-registered')
async sendWelcomeEmail(user: User) {
  await this.emailService.send(user.email, 'Welcome!');
}

// Subscriber 2: Create profile
@EventPattern('user-registered')
async createProfile(user: User) {
  await this.profileService.create(user.id);
}

// Subscriber 3: Track analytics
@EventPattern('user-registered')
async trackSignup(user: User) {
  await this.analytics.track('user_registered', user);
}
```

## Message Structure

### Best Practices

```typescript
interface Message<T = any> {
  // Unique identifier
  id: string;
  
  // Message type/event name
  type: string;
  
  // ISO timestamp
  timestamp: string;
  
  // Actual data
  payload: T;
  
  // Metadata
  metadata?: {
    producerId?: string;
    correlationId?: string;
    causationId?: string;
    userId?: string;
    traceId?: string;
  };
}

// Example
const orderCreatedMessage: Message<OrderData> = {
  id: 'msg_123abc',
  type: 'order.created',
  timestamp: new Date().toISOString(),
  payload: {
    orderId: 'order_456',
    userId: 'user_789',
    amount: 99.99,
    items: [...]
  },
  metadata: {
    producerId: 'order-service',
    correlationId: 'req_abc123',
    traceId: 'trace_xyz789'
  }
};
```

## Next Steps

- Learn about [Topics & Exchanges](./topics-exchanges.md)
- Explore [Consumer Groups](./consumer-groups.md)
- Check [Delivery Semantics](./delivery-semantics.md)

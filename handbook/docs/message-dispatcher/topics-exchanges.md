# Topics & Exchanges

## Overview

Topics and Exchanges are routing mechanisms that determine how messages flow from producers to consumers. Understanding these concepts is crucial for building flexible message-driven architectures.

## Kafka Topics

### What is a Topic?

A topic is a category or feed name to which messages are published. Topics are divided into partitions for scalability and parallelism.

```
Topic: order-events
├── Partition 0: [msg1, msg4, msg7, ...]
├── Partition 1: [msg2, msg5, msg8, ...]
└── Partition 2: [msg3, msg6, msg9, ...]
```

### Creating Topics

```typescript
// kafka-admin.service.ts
import { Kafka } from 'kafkajs';

@Injectable()
export class KafkaAdminService {
  private kafka: Kafka;
  private admin;

  constructor() {
    this.kafka = new Kafka({
      clientId: 'admin-client',
      brokers: ['localhost:9092']
    });
    this.admin = this.kafka.admin();
  }

  async createTopic(topicName: string, partitions: number = 3, replicationFactor: number = 1) {
    await this.admin.connect();

    await this.admin.createTopics({
      topics: [{
        topic: topicName,
        numPartitions: partitions,
        replicationFactor: replicationFactor,
        configEntries: [
          { name: 'retention.ms', value: '604800000' },        // 7 days
          { name: 'cleanup.policy', value: 'delete' },
          { name: 'compression.type', value: 'snappy' },
          { name: 'max.message.bytes', value: '1000000' }      // 1 MB
        ]
      }]
    });

    console.log(`Topic '${topicName}' created with ${partitions} partitions`);

    await this.admin.disconnect();
  }

  async listTopics() {
    await this.admin.connect();
    const topics = await this.admin.listTopics();
    await this.admin.disconnect();
    return topics;
  }

  async deleteTopic(topicName: string) {
    await this.admin.connect();
    await this.admin.deleteTopics({ topics: [topicName] });
    await this.admin.disconnect();
  }
}
```

### Topic Naming Conventions

```typescript
//  GOOD: Descriptive, hierarchical
'order.created'
'order.updated'
'order.cancelled'
'payment.succeeded'
'payment.failed'
'user.registered'
'inventory.stock-updated'

//  BAD: Vague, inconsistent
'orders'
'updates'
'data'
'events'
```

### Producing to Topics

```typescript
@Injectable()
export class OrderProducer {
  constructor(@Inject('KAFKA_SERVICE') private kafka: ClientKafka) {}

  async publishOrderCreated(order: Order) {
    // Produce to topic
    await this.kafka.emit('order.created', {
      key: order.id,        // Messages with same key go to same partition
      value: {
        orderId: order.id,
        userId: order.userId,
        amount: order.amount,
        items: order.items,
        timestamp: Date.now()
      },
      headers: {
        'correlation-id': 'req_123',
        'event-type': 'OrderCreated'
      }
    });
  }

  // Multiple topics for different event types
  async publishOrderUpdated(order: Order) {
    await this.kafka.emit('order.updated', order);
  }

  async publishOrderCancelled(orderId: string, reason: string) {
    await this.kafka.emit('order.cancelled', { orderId, reason });
  }
}
```

### Consuming from Topics

```typescript
@Controller()
export class OrderConsumer {
  // Listen to specific topic
  @EventPattern('order.created')
  async handleOrderCreated(event: OrderCreatedEvent) {
    console.log('Order created:', event.orderId);
    await this.processOrder(event);
  }

  @EventPattern('order.updated')
  async handleOrderUpdated(event: OrderUpdatedEvent) {
    console.log('Order updated:', event.orderId);
    await this.updateOrder(event);
  }

  @EventPattern('order.cancelled')
  async handleOrderCancelled(event: OrderCancelledEvent) {
    console.log('Order cancelled:', event.orderId);
    await this.cancelOrder(event);
  }
}
```

## RabbitMQ Exchanges

### Exchange Types

RabbitMQ uses exchanges to route messages to queues based on rules.

```
Producer → Exchange → [Routing Logic] → Queues → Consumers
```

### 1. Direct Exchange

Routes messages to queues based on **exact routing key match**.

```
Message with key "error" → Only goes to queue bound with "error"
```

**Setup:**

```typescript
import * as amqp from 'amqplib';

@Injectable()
export class DirectExchangeService {
  private connection: amqp.Connection;
  private channel: amqp.Channel;

  async setup() {
    this.connection = await amqp.connect('amqp://localhost');
    this.channel = await this.connection.createChannel();

    // Create exchange
    await this.channel.assertExchange('logs', 'direct', { durable: true });

    // Create queues
    await this.channel.assertQueue('error-logs', { durable: true });
    await this.channel.assertQueue('info-logs', { durable: true });

    // Bind queues to exchange with routing keys
    await this.channel.bindQueue('error-logs', 'logs', 'error');
    await this.channel.bindQueue('info-logs', 'logs', 'info');
  }

  // Publish with routing key
  async publishLog(level: string, message: string) {
    this.channel.publish(
      'logs',              // exchange
      level,               // routing key
      Buffer.from(message)
    );
  }

  // Consume from specific queue
  async consumeErrors() {
    await this.channel.consume('error-logs', (msg) => {
      if (msg) {
        console.log('ERROR:', msg.content.toString());
        this.channel.ack(msg);
      }
    });
  }
}

// Usage
await service.publishLog('error', 'Database connection failed'); // → error-logs
await service.publishLog('info', 'User logged in');               // → info-logs
```

**Flow:**

```
Producer ─'error'→ Direct Exchange ─'error'→ error-logs → Error Handler
                                   ─'info'→ info-logs → Logger
```

### 2. Fanout Exchange

Broadcasts messages to **all bound queues**, ignoring routing key.

```
One message → All queues get a copy
```

**Setup:**

```typescript
@Injectable()
export class FanoutExchangeService {
  private channel: amqp.Channel;

  async setup() {
    // Create fanout exchange
    await this.channel.assertExchange('notifications', 'fanout', { durable: false });

    // Create multiple queues
    await this.channel.assertQueue('email-queue');
    await this.channel.assertQueue('sms-queue');
    await this.channel.assertQueue('push-queue');

    // Bind all queues to exchange (no routing key needed)
    await this.channel.bindQueue('email-queue', 'notifications', '');
    await this.channel.bindQueue('sms-queue', 'notifications', '');
    await this.channel.bindQueue('push-queue', 'notifications', '');
  }

  // Publish to all
  async notifyUser(message: string) {
    this.channel.publish(
      'notifications',
      '',                    // Routing key ignored in fanout
      Buffer.from(message)
    );
  }
}

// Usage
await service.notifyUser('Your order has shipped');
// → email-queue: sends email
// → sms-queue: sends SMS
// → push-queue: sends push notification
```

**Flow:**

```
Producer → Fanout Exchange ─┬→ email-queue → Email Service
                            ├→ sms-queue → SMS Service  
                            └→ push-queue → Push Service
```

**Use cases:**
- Broadcasting events
- Notifications to multiple channels
- Logging to multiple destinations
- Real-time updates

### 3. Topic Exchange

Routes based on **pattern matching** with wildcards.

**Wildcards:**
- `*` (star): Matches exactly **one word**
- `#` (hash): Matches **zero or more words**

```
Routing key: 'order.us.created'

Pattern 'order.*.created' → Match 
Pattern 'order.#'         → Match 
Pattern 'payment.*'       → No match 
```

**Setup:**

```typescript
@Injectable()
export class TopicExchangeService {
  private channel: amqp.Channel;

  async setup() {
    await this.channel.assertExchange('events', 'topic', { durable: true });

    // Different consumers with different patterns
    
    // Consumer 1: All order events
    await this.channel.assertQueue('all-orders');
    await this.channel.bindQueue('all-orders', 'events', 'order.#');

    // Consumer 2: Only created events
    await this.channel.assertQueue('created-events');
    await this.channel.bindQueue('created-events', 'events', '*.*.created');

    // Consumer 3: Only US region
    await this.channel.assertQueue('us-events');
    await this.channel.bindQueue('us-events', 'events', '*.us.*');

    // Consumer 4: Specific pattern
    await this.channel.assertQueue('order-us-created');
    await this.channel.bindQueue('order-us-created', 'events', 'order.us.created');
  }

  async publishEvent(routingKey: string, data: any) {
    this.channel.publish(
      'events',
      routingKey,
      Buffer.from(JSON.stringify(data))
    );
  }
}

// Usage examples
await service.publishEvent('order.us.created', {...});
// Matches: 'order.#', '*.*.created', '*.us.*', 'order.us.created'

await service.publishEvent('order.eu.updated', {...});
// Matches: 'order.#'

await service.publishEvent('payment.us.processed', {...});
// Matches: '*.us.*', '*.*.processed'
```

**Routing Examples:**

```
Routing Key          | Pattern 'order.*'  | Pattern 'order.#'  | Pattern '*.*.created'
---------------------|--------------------|--------------------|----------------------
order.created        |  Match           |  Match           |  No match
order.us.created     |  No match        |  Match           |  Match
order.updated        |  Match           |  Match           |  No match
payment.created      |  No match        |  No match        |  No match
order.us.eu.created  |  No match        |  Match           |  No match
```

**Use cases:**
- Multi-region routing
- Category-based filtering
- Hierarchical event routing
- Flexible subscriptions

### 4. Headers Exchange

Routes based on **message headers** instead of routing key.

```typescript
@Injectable()
export class HeadersExchangeService {
  private channel: amqp.Channel;

  async setup() {
    await this.channel.assertExchange('tasks', 'headers', { durable: true });

    // Queue 1: Urgent PDF tasks
    await this.channel.assertQueue('urgent-pdf');
    await this.channel.bindQueue('urgent-pdf', 'tasks', '', {
      'x-match': 'all',      // Must match ALL headers
      'format': 'pdf',
      'priority': 'urgent'
    });

    // Queue 2: Any image tasks
    await this.channel.assertQueue('image-processing');
    await this.channel.bindQueue('image-processing', 'tasks', '', {
      'x-match': 'any',      // Match ANY header
      'format': 'jpg',
      'format': 'png'
    });
  }

  async publishTask(data: any, headers: Record<string, any>) {
    this.channel.publish(
      'tasks',
      '',                    // Routing key not used
      Buffer.from(JSON.stringify(data)),
      { headers }
    );
  }
}

// Usage
await service.publishTask(
  { task: 'generate-report' },
  { format: 'pdf', priority: 'urgent' }
);
// → urgent-pdf queue

await service.publishTask(
  { task: 'resize-image' },
  { format: 'jpg', size: 'large' }
);
// → image-processing queue
```

**Match Modes:**

| x-match | Behavior |
|---------|----------|
| `all` | Message must have ALL specified headers with matching values |
| `any` | Message must have AT LEAST ONE matching header |

**Use cases:**
- Complex routing logic
- Attribute-based routing
- Content-based filtering

## Topic vs Exchange Comparison

| Feature | Kafka Topics | RabbitMQ Exchanges |
|---------|-------------|-------------------|
| **Routing** | Key-based partitioning | Exchange type determines routing |
| **Partitions** | Yes (parallelism) | No (queues can have multiple consumers) |
| **Ordering** | Per partition | Per queue |
| **Message Replay** | Yes | No |
| **Wildcards** | No | Yes (topic exchange) |
| **Broadcasting** | Consumer groups | Fanout exchange |
| **Complex Routing** | Limited | Very flexible |

## Best Practices

### 1. Topic/Exchange Naming

```typescript
//  GOOD: Clear hierarchy
'ecommerce.order.created'
'ecommerce.payment.succeeded'
'analytics.user.login'

//  BAD: Flat, unclear
'order_created'
'payment'
'event123'
```

### 2. Use Appropriate Exchange Type

```typescript
// Direct: Exact matching
logs: 'error', 'warning', 'info' → Use Direct Exchange

// Fanout: Broadcast to all
notifications → Use Fanout Exchange

// Topic: Pattern matching
'order.*.created', 'payment.us.*' → Use Topic Exchange

// Headers: Complex logic
Multiple attributes → Use Headers Exchange
```

### 3. Separate Concerns

```typescript
//  GOOD: Separate topics/exchanges
'order-events'    // Order lifecycle
'payment-events'  // Payment lifecycle
'shipping-events' // Shipping lifecycle

//  BAD: Single topic for everything
'all-events'
```

### 4. Version Your Messages

```typescript
// Topic names with versions
'order.v1.created'
'order.v2.created'

// Or version in payload
{
  version: 2,
  data: {...}
}
```

## Next Steps

- Learn about [Consumer Groups](./consumer-groups.md)
- Explore partitioning strategies for scalability
- Study message ordering guarantees

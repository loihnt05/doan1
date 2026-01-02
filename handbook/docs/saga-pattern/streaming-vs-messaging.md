# Streaming vs Messaging

## Overview

**Messaging** and **Streaming** are both event-driven patterns, but they serve different purposes and have different characteristics.

## Key Differences

| Aspect | Messaging | Streaming |
|--------|-----------|-----------|
| **Purpose** | Task execution | Data processing |
| **State** | Stateless | Stateful |
| **Processing** | Discrete events | Continuous flow |
| **Retention** | Short (minutes/hours) | Long (days/weeks) |
| **Example** | Send email | Calculate revenue |
| **Consumption** | Queue (consume once) | Pub/Sub (multiple consumers) |

## Messaging Pattern

### Characteristics

- **Discrete Events**: Each event is independent
- **Stateless Processing**: No memory between events
- **Task-Oriented**: Do something once
- **Fire-and-Forget**: Event consumed and done

### Example: Email Notification

```typescript
@Injectable()
export class NotificationService implements OnModuleInit {
  async onModuleInit() {
    await this.kafkaConsumer.subscribe(
      'notification-service',
      [Topics.ORDER_CREATED],
      this.handleOrderCreated.bind(this),
    );
  }

  private async handleOrderCreated(event: OrderCreatedEvent) {
    // Stateless: Just send email and done
    await this.sendEmail({
      to: event.data.userEmail,
      subject: 'Order Confirmed',
      body: `Your order ${event.data.orderId} has been created.`,
    });

    console.log(`Email sent for order ${event.data.orderId}`);
    // No state maintained
  }
}
```

**Use Cases:**
- Send notifications (email, SMS)
- Trigger webhooks
- Execute commands
- One-time tasks

## Streaming Pattern

### Characteristics

- **Continuous Flow**: Events are part of a stream
- **Stateful Processing**: Maintain state across events
- **Analytics-Oriented**: Aggregate, calculate, analyze
- **Time-Based**: Windows, intervals, periods

### Example: Revenue Analytics

```typescript
@Injectable()
export class AnalyticsService implements OnModuleInit {
  // Stateful: Maintain metrics
  private totalRevenue = 0;
  private orderCount = 0;
  private ordersPerMinute: number[] = Array(60).fill(0);
  private currentMinuteIndex = 0;
  private successfulOrders = 0;
  private failedOrders = 0;

  async onModuleInit() {
    // Subscribe to multiple events (streaming)
    await this.kafkaConsumer.subscribe(
      ConsumerGroups.ANALYTICS_SERVICE,
      [
        Topics.ORDER_CREATED,
        Topics.PAYMENT_COMPLETED,
        Topics.PAYMENT_FAILED,
        Topics.INVENTORY_RESERVED,
      ],
      this.handleEvent.bind(this),
    );

    // Periodic processing (time window)
    setInterval(() => this.updateTimeWindow(), 60000); // Every minute
    setInterval(() => this.printReport(), 10000); // Every 10 seconds
  }

  private async handleEvent(event: any) {
    // Update state based on event type
    switch (event.eventType) {
      case 'OrderCreated':
        this.orderCount++;
        this.ordersPerMinute[this.currentMinuteIndex]++;
        break;

      case 'PaymentCompleted':
        this.totalRevenue += event.data.amount;
        this.successfulOrders++;
        break;

      case 'PaymentFailed':
        this.failedOrders++;
        break;

      case 'InventoryReserved':
        // Track inventory metrics
        break;
    }
  }

  private updateTimeWindow() {
    // Slide time window
    this.currentMinuteIndex = (this.currentMinuteIndex + 1) % 60;
    this.ordersPerMinute[this.currentMinuteIndex] = 0;
  }

  private printReport() {
    console.log('\n📊 [STREAMING ANALYTICS]');
    console.log(`   Total Orders: ${this.orderCount}`);
    console.log(`   Successful: ${this.successfulOrders}`);
    console.log(`   Failed: ${this.failedOrders}`);
    console.log(`   Success Rate: ${(this.successfulOrders/this.orderCount*100).toFixed(1)}%`);
    console.log(`   Total Revenue: $${this.totalRevenue.toFixed(2)}`);
    console.log(`   Orders Last Minute: ${this.ordersPerMinute[this.currentMinuteIndex]}`);
  }

  getMetrics() {
    return {
      totalOrders: this.orderCount,
      successfulOrders: this.successfulOrders,
      failedOrders: this.failedOrders,
      successRate: (this.successfulOrders / this.orderCount * 100).toFixed(1),
      totalRevenue: this.totalRevenue.toFixed(2),
      ordersLastMinute: this.ordersPerMinute[this.currentMinuteIndex],
    };
  }
}
```

**Use Cases:**
- Real-time analytics
- Revenue tracking
- Dashboard metrics
- Fraud detection
- Monitoring systems

## Stream Processing Patterns

### 1. Aggregation

Combine multiple events into summary:

```typescript
// Sum, count, average
totalRevenue += event.amount;
orderCount++;
averageOrderValue = totalRevenue / orderCount;
```

### 2. Windowing

Group events by time:

```typescript
// Tumbling window (non-overlapping)
const ordersThisMinute = ordersPerMinute[currentMinute];

// Sliding window (overlapping)
const ordersLast5Minutes = ordersPerMinute.slice(-5).reduce((a, b) => a + b, 0);

// Session window (activity-based)
if (timeSinceLastOrder > 5 * 60 * 1000) {
  // Start new session
  sessionCount++;
}
```

### 3. Filtering

Select subset of events:

```typescript
// High-value orders
if (event.amount > 1000) {
  highValueOrders.push(event);
}

// Failed payments only
if (event.eventType === 'PaymentFailed') {
  failedPayments.push(event);
}
```

### 4. Enrichment

Add context to events:

```typescript
// Add user details
const enrichedEvent = {
  ...event,
  userDetails: await this.getUserProfile(event.userId),
  locationDetails: await this.getLocation(event.ip),
};
```

### 5. Joining

Combine multiple streams:

```typescript
// Join orders with payments
const order = ordersMap.get(event.orderId);
const payment = paymentsMap.get(event.paymentId);

const joined = {
  orderId: order.id,
  amount: order.total,
  paymentMethod: payment.method,
  transactionId: payment.transactionId,
};
```

## Lambda vs Kappa Architecture

### Lambda Architecture (Traditional)

```
                    ┌──────────────────┐
                    │   Batch Layer    │
                    │   (Accurate)     │
Events ────────────▶│   Hadoop/Spark   │────┐
    │               └──────────────────┘    │
    │                                       │
    │               ┌──────────────────┐    │
    └──────────────▶│   Speed Layer    │────┤
                    │   (Fast)         │    │
                    │   Storm/Flink    │    │
                    └──────────────────┘    │
                                            ▼
                                    ┌───────────────┐
                                    │ Serving Layer │
                                    │  (Combined)   │
                                    └───────────────┘
```

**Characteristics:**
- Two processing pipelines (batch + streaming)
- Batch layer: Accurate but slow
- Speed layer: Fast but approximate
- Merge results in serving layer

**Pros:**
-  Accurate results (batch)
-  Low latency (speed)
-  Best of both worlds

**Cons:**
-  Complex (maintain two systems)
-  Hard to sync batch and speed layers
-  Different codebases
-  Duplicate logic

### Kappa Architecture (Modern)

```
Events ──▶ Stream Processor (Kafka Streams) ──▶ Serving Layer
                    ▲
                    │
                    └── Reprocess from beginning if needed
```

**Characteristics:**
- Single processing pipeline
- Kafka-centric
- Replay capability
- Same code for batch and streaming

**Pros:**
-  Simple (one system)
-  Easy to maintain
-  Kafka replay for reprocessing
-  Modern approach

**Cons:**
-  Need to reprocess for schema changes
-  Single processing model (no batch optimization)

**Most systems today use Kappa**

## Kafka Topics: Messaging vs Streaming

### Messaging Topics

```typescript
// Short retention (1 day)
Topics.ORDER_CREATED
Topics.PAYMENT_COMPLETED

// Consumed once per consumer group
ConsumerGroups.PAYMENT_SERVICE
ConsumerGroups.INVENTORY_SERVICE
```

**Configuration:**
```
retention.ms=86400000  # 1 day
cleanup.policy=delete
```

### Streaming Topics

```typescript
// Long retention (7 days or more)
Topics.ORDER_EVENTS_STREAM
Topics.PAYMENT_EVENTS_STREAM

// Multiple consumers (pub/sub)
ConsumerGroups.ANALYTICS_SERVICE
ConsumerGroups.FRAUD_DETECTION_SERVICE
ConsumerGroups.REPORTING_SERVICE
```

**Configuration:**
```
retention.ms=604800000  # 7 days
cleanup.policy=compact  # Keep latest per key
```

## Stateful vs Stateless

### Stateless (Messaging)

```typescript
// No state between events
async handleEvent(event) {
  await this.sendEmail(event.data);
  // Done, forget about it
}
```

**Characteristics:**
- No memory
- Each event independent
- Easy to scale (add more instances)
- No coordination needed

### Stateful (Streaming)

```typescript
// Maintain state
private revenue = 0;
private orders = new Map();

async handleEvent(event) {
  this.revenue += event.amount;
  this.orders.set(event.orderId, event);
  // State persists
}
```

**Characteristics:**
- Memory of previous events
- Must handle state management
- Harder to scale (state partitioning)
- Need coordination

**State Management Solutions:**
- In-memory (our demo)
- Redis (shared state)
- RocksDB (Kafka Streams)
- Database (persistent state)

## When to Use Each

### Use Messaging When:

-  Task execution (send email, call API)
-  One-time operations
-  No state needed
-  Simple event handling
-  Independent events

### Use Streaming When:

-  Analytics and metrics
-  Aggregations (sum, count, average)
-  Time-based processing
-  Need to combine multiple events
-  Dashboard and reporting
-  Fraud detection
-  Monitoring systems

## Implementation in Phase 5

### Messaging Examples

```typescript
// Payment Service (messaging)
@KafkaListener(Topics.ORDER_CREATED)
handleOrderCreated(event) {
  // Process payment (stateless)
  const result = this.processPayment(event.data);
  
  // Emit next event
  this.kafkaProducer.send(
    result.success ? Topics.PAYMENT_COMPLETED : Topics.PAYMENT_FAILED,
    result,
  );
}
```

### Streaming Examples

```typescript
// Analytics Service (streaming)
@KafkaListener([
  Topics.ORDER_CREATED,
  Topics.PAYMENT_COMPLETED,
  Topics.PAYMENT_FAILED,
])
handleEvent(event) {
  // Update state (stateful)
  switch (event.eventType) {
    case 'OrderCreated':
      this.orderCount++;
      break;
    case 'PaymentCompleted':
      this.totalRevenue += event.data.amount;
      break;
  }
}

// Periodic reporting (time window)
setInterval(() => {
  console.log('Total Revenue:', this.totalRevenue);
  console.log('Order Count:', this.orderCount);
}, 10000);
```

## Summary

| Pattern | Purpose | State | Example |
|---------|---------|-------|---------|
| **Messaging** | Task execution | Stateless | Send email |
| **Streaming** | Data processing | Stateful | Calculate revenue |

**Key Takeaways:**
- Messaging = Do something once
- Streaming = Analyze continuous data
- Both use Kafka, different purposes
- Can use both in same system (like Phase 5)

**In Phase 5:**
- Saga services use messaging (order → payment → inventory)
- Analytics service uses streaming (revenue aggregation)
- Both patterns working together

Next: Explore Lambda and Kappa architectures for stream processing

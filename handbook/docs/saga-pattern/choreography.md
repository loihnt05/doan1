# Choreography Pattern

## What is Choreography?

**Choreography** is a decentralized saga pattern where each service reacts to events and emits new events. There is **no central coordinator**.

Think of it like a dance: each dancer (service) knows their steps and reacts to other dancers without a conductor.

## Architecture

```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Order     │       │  Payment    │       │  Inventory  │
│  Service    │       │   Service   │       │   Service   │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       │ OrderCreated        │                     │
       ├────────────────────▶│                     │
       │                     │ PaymentCompleted    │
       │                     ├────────────────────▶│
       │                     │                     │
       │                     │◀────────────────────┤
       │                     │   InventoryReserved │
       │                     │                     │
```

Each service:
1. Listens for specific events
2. Performs local transaction
3. Emits next event
4. Other services react

## Implementation

### 1. Event Types

First, define all events in the saga:

```typescript
// libs/kafka/events.types.ts

export interface OrderCreatedEvent {
  eventType: 'OrderCreated';
  data: {
    orderId: string;
    userId: string;
    items: Array<{ productId: string; quantity: number; price: number }>;
    total: number;
  };
}

export interface PaymentCompletedEvent {
  eventType: 'PaymentCompleted';
  data: {
    orderId: string;
    paymentId: string;
    amount: number;
    transactionId: string;
  };
}

export interface PaymentFailedEvent {
  eventType: 'PaymentFailed';
  data: {
    orderId: string;
    reason: string;
    errorCode: string;
  };
}

export interface InventoryReservedEvent {
  eventType: 'InventoryReserved';
  data: {
    orderId: string;
    reservationId: string;
    items: Array<{ productId: string; quantity: number }>;
  };
}

export interface InventoryFailedEvent {
  eventType: 'InventoryFailed';
  data: {
    orderId: string;
    reason: string;
    items: Array<{ productId: string; availableQuantity: number }>;
  };
}

export interface OrderCancelledEvent {
  eventType: 'OrderCancelled';
  data: {
    orderId: string;
    reason: string;
    cancelledAt: string;
  };
}
```

### 2. Saga Initiator (Order Service)

The order service starts the saga and handles compensation:

```typescript
// apps/order-service/src/order-service.service.ts

@Injectable()
export class OrderServiceService implements OnModuleInit {
  private orders: Map<string, any> = new Map();

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  async onModuleInit() {
    // Subscribe to compensation events
    await this.kafkaConsumer.subscribe(
      ConsumerGroups.ORDER_SERVICE,
      [Topics.PAYMENT_FAILED, Topics.INVENTORY_FAILED],
      this.handleCompensationEvent.bind(this),
    );
  }

  // SAGA START: Create order and emit event
  async createOrder(orderDto: any) {
    const order = {
      id: uuidv4(),
      ...orderDto,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // Store order locally
    this.orders.set(order.id, order);

    // Emit event to start saga
    const event: OrderCreatedEvent = {
      eventType: 'OrderCreated',
      data: order,
    };

    await this.kafkaProducer.send(Topics.ORDER_CREATED, event, order.id);
    
    return order;
  }

  // COMPENSATION: Handle payment or inventory failure
  private async handleCompensationEvent(event: PaymentFailedEvent | InventoryFailedEvent) {
    const order = this.orders.get(event.data.orderId);
    
    if (!order) {
      console.error('Order not found:', event.data.orderId);
      return;
    }

    // Update order status
    order.status = 'cancelled';
    order.cancellationReason = event.data.reason;
    order.cancelledAt = new Date().toISOString();

    // Emit cancellation event
    const cancelledEvent: OrderCancelledEvent = {
      eventType: 'OrderCancelled',
      data: {
        orderId: order.id,
        reason: event.data.reason,
        cancelledAt: order.cancelledAt,
      },
    };

    await this.kafkaProducer.send(Topics.ORDER_CANCELLED, cancelledEvent, order.id);

    console.log(`[COMPENSATION] Order ${order.id} cancelled: ${event.data.reason}`);
  }

  // Query order status
  async getOrder(orderId: string) {
    return this.orders.get(orderId);
  }
}
```

### 3. Saga Participant (Payment Service)

Payment service listens for OrderCreated and emits success/failure:

```typescript
// apps/payment-service/src/payment-service.service.ts

@Injectable()
export class PaymentServiceService implements OnModuleInit {
  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  async onModuleInit() {
    await this.kafkaConsumer.subscribe(
      ConsumerGroups.PAYMENT_SERVICE,
      [Topics.ORDER_CREATED],
      this.handleOrderCreated.bind(this),
    );
  }

  private async handleOrderCreated(event: OrderCreatedEvent) {
    console.log('[Payment Service] Processing payment for order:', event.data.orderId);

    // Simulate payment processing (30% failure rate for demo)
    const paymentSucceeds = Math.random() > 0.3;

    if (paymentSucceeds) {
      // SUCCESS PATH
      await this.handlePaymentSuccess(event);
    } else {
      // FAILURE PATH - Trigger compensation
      await this.handlePaymentFailure(event);
    }
  }

  private async handlePaymentSuccess(event: OrderCreatedEvent) {
    const completedEvent: PaymentCompletedEvent = {
      eventType: 'PaymentCompleted',
      data: {
        orderId: event.data.orderId,
        paymentId: uuidv4(),
        amount: event.data.total,
        transactionId: `txn_${uuidv4()}`,
      },
    };

    await this.kafkaProducer.send(
      Topics.PAYMENT_COMPLETED,
      completedEvent,
      event.data.orderId,
    );

    console.log('[Payment Service] Payment completed:', event.data.orderId);
  }

  private async handlePaymentFailure(event: OrderCreatedEvent) {
    const failedEvent: PaymentFailedEvent = {
      eventType: 'PaymentFailed',
      data: {
        orderId: event.data.orderId,
        reason: 'Insufficient funds',
        errorCode: 'PAYMENT_DECLINED',
      },
    };

    await this.kafkaProducer.send(
      Topics.PAYMENT_FAILED,
      failedEvent,
      event.data.orderId,
    );

    console.log('[Payment Service] Payment failed:', event.data.orderId);
  }
}
```

### 4. Saga Participant (Inventory Service)

Inventory service listens for PaymentCompleted and emits success/failure:

```typescript
// apps/inventory-service/src/inventory-service.service.ts

@Injectable()
export class InventoryServiceService implements OnModuleInit {
  private inventory: Map<string, number> = new Map([
    ['prod-1', 100],
    ['prod-2', 50],
    ['prod-3', 25],
  ]);

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly kafkaConsumer: KafkaConsumerService,
  ) {}

  async onModuleInit() {
    await this.kafkaConsumer.subscribe(
      ConsumerGroups.INVENTORY_SERVICE,
      [Topics.PAYMENT_COMPLETED],
      this.handlePaymentCompleted.bind(this),
    );
  }

  private async handlePaymentCompleted(event: PaymentCompletedEvent) {
    console.log('[Inventory Service] Reserving inventory for order:', event.data.orderId);

    // Simulate inventory check (20% failure rate for demo)
    const inventoryAvailable = Math.random() > 0.2;

    if (inventoryAvailable) {
      await this.handleInventorySuccess(event);
    } else {
      await this.handleInventoryFailure(event);
    }
  }

  private async handleInventorySuccess(event: PaymentCompletedEvent) {
    const reservedEvent: InventoryReservedEvent = {
      eventType: 'InventoryReserved',
      data: {
        orderId: event.data.orderId,
        reservationId: uuidv4(),
        items: [{ productId: 'prod-1', quantity: 2 }],
      },
    };

    await this.kafkaProducer.send(
      Topics.INVENTORY_RESERVED,
      reservedEvent,
      event.data.orderId,
    );

    console.log('[Inventory Service] Inventory reserved:', event.data.orderId);
  }

  private async handleInventoryFailure(event: PaymentCompletedEvent) {
    const failedEvent: InventoryFailedEvent = {
      eventType: 'InventoryFailed',
      data: {
        orderId: event.data.orderId,
        reason: 'Insufficient stock',
        items: [{ productId: 'prod-1', availableQuantity: 0 }],
      },
    };

    await this.kafkaProducer.send(
      Topics.INVENTORY_FAILED,
      failedEvent,
      event.data.orderId,
    );

    console.log('[Inventory Service] Inventory failed:', event.data.orderId);
  }
}
```

## Event Flow Diagram

### Success Path

```
Order Service          Payment Service       Inventory Service
     │                        │                      │
     │  1. Create Order       │                      │
     ├─────────────────────┐  │                      │
     │ OrderCreatedEvent   │  │                      │
     │                     └─▶│  2. Process Payment  │
     │                        ├──────────────────┐   │
     │                        │ PaymentCompleted │   │
     │                        │                  └──▶│  3. Reserve Items
     │                        │                      ├──────────────────┐
     │                        │                      │ InventoryReserved│
     │                        │                      │                  │
     ✓ Saga Complete          ✓                      ✓                  │
```

### Compensation Path (Payment Fails)

```
Order Service          Payment Service
     │                        │
     │  1. Create Order       │
     ├─────────────────────┐  │
     │ OrderCreatedEvent   │  │
     │                     └─▶│  2. Payment Fails
     │                        ├──────────────────┐
     │                        │ PaymentFailedEvent│
     │  3. Compensation    ◀──┘                  │
     ├─────────────────────┐  │
     │ OrderCancelledEvent │  │
     │                     │  │
     ✗ Saga Cancelled        │
```

## Pros and Cons

### Advantages ✅

1. **Loose Coupling**
   - Services don't know about each other
   - Easy to add new participants
   - No direct dependencies

2. **No Single Point of Failure**
   - No central orchestrator to fail
   - Each service is independent
   - Resilient to partial failures

3. **Scalability**
   - Services can scale independently
   - Event-driven by nature
   - Kafka handles load distribution

4. **Flexibility**
   - Easy to add new event handlers
   - Multiple services can react to same event
   - Example: Analytics service subscribes to all events

### Disadvantages ❌

1. **Complex Flow Understanding**
   - Hard to see overall saga flow
   - Must trace events across services
   - No single place shows complete process

2. **Cyclic Dependencies**
   - Services react to events from each other
   - Can create circular event chains
   - Example: A → B → C → A (loop!)

3. **Difficult Debugging**
   - Events scattered across services
   - Must check logs of all services
   - No centralized saga state

4. **Testing Complexity**
   - Must test entire event chain
   - Integration tests required
   - Hard to mock event flow

## Best Practices

### 1. Event Naming Convention

Use clear, domain-driven event names:

```typescript
// ✅ Good
OrderCreated
PaymentCompleted
InventoryReserved

// ❌ Bad
OrderEvent
PaymentDone
StockChecked
```

### 2. Idempotency

Always handle duplicate events:

```typescript
private processedEvents = new Set<string>();

async handleEvent(event: any) {
  // Check if already processed
  if (this.processedEvents.has(event.id)) {
    console.log('Event already processed:', event.id);
    return;
  }

  // Process event
  await this.process(event);

  // Mark as processed
  this.processedEvents.add(event.id);
}
```

### 3. Correlation ID

Track saga across services:

```typescript
const event = {
  eventType: 'OrderCreated',
  correlationId: uuidv4(), // Same across all events in saga
  data: { ... },
};
```

### 4. Timeout Handling

Implement saga timeout:

```typescript
const sagaTimeout = setTimeout(() => {
  if (order.status === 'pending') {
    this.cancelOrder(order.id, 'Saga timeout');
  }
}, 30000); // 30 seconds
```

### 5. Dead Letter Queue

Handle failed events:

```typescript
try {
  await this.handleEvent(event);
} catch (error) {
  // Send to DLQ for manual review
  await this.kafkaProducer.send(Topics.DEAD_LETTER_QUEUE, event);
}
```

## When to Use Choreography

### Good Use Cases ✅

- **Simple workflows** (2-4 steps)
- **Independent services** (truly autonomous)
- **Event-driven architecture** (already using events)
- **No complex business logic** in coordination

### When to Use Orchestration Instead ❌

- **Complex workflows** (5+ steps)
- **Need saga state tracking**
- **Complex branching logic**
- **Clear ownership required**

## Summary

Choreography is ideal for:
- Simple, linear workflows
- Event-driven microservices
- When you want loose coupling
- When services are truly independent

Key points:
- Each service reacts to events
- No central coordinator
- Compensation via events
- Eventually consistent

Next: [Orchestration Pattern](./orchestration.md) for comparison

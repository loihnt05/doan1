# Orchestration vs Choreography - Visual Comparison

## Choreography Pattern (Implemented in Phase 5)

### Architecture
```
┌─────────────┐       ┌─────────────┐       ┌─────────────┐
│   Order     │       │  Payment    │       │  Inventory  │
│  Service    │       │   Service   │       │   Service   │
└──────┬──────┘       └──────┬──────┘       └──────┬──────┘
       │                     │                     │
       │  Kafka Topics       │                     │
       │  ════════════       │                     │
       │                     │                     │
       │ ① OrderCreated      │                     │
       ├────────────────────▶│                     │
       │                     │                     │
       │                     │ ② PaymentCompleted  │
       │                     ├────────────────────▶│
       │                     │                     │
       │ ④ PaymentFailed     │                     │
       │◀────────────────────┤                     │
       │                     │                     │
       │                     │  ③ InventoryReserved│
       │◀────────────────────┴─────────────────────┤
       │                                           │
```

**Flow:**
1. Order Service emits `OrderCreatedEvent`
2. Payment Service consumes, emits `PaymentCompletedEvent` or `PaymentFailedEvent`
3. Inventory Service consumes payment events, emits `InventoryReservedEvent` or `InventoryFailedEvent`
4. Order Service consumes failure events for compensation

**Characteristics:**
- ✅ No central coordinator
- ✅ Services react to events independently
- ✅ Loose coupling
- ❌ Hard to see overall flow
- ❌ Cyclic event dependencies possible

---

## Orchestration Pattern (Conceptual)

### Architecture
```
                    ┌──────────────────────┐
                    │  Saga Orchestrator   │
                    │   (Coordinator)      │
                    └──────────┬───────────┘
                               │
            ┌──────────────────┼──────────────────┐
            │                  │                  │
            │ ① Process        │ ② Reserve        │ ③ Ship
            │    Payment       │    Inventory     │    Order
            ▼                  ▼                  ▼
    ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
    │   Payment     │  │   Inventory   │  │   Shipping    │
    │   Service     │  │   Service     │  │   Service     │
    └───────┬───────┘  └───────┬───────┘  └───────┬───────┘
            │                  │                  │
            │ Success/Failure  │ Success/Failure  │ Success/Failure
            └──────────────────┴──────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │  Orchestrator        │
                    │  (Decides next step) │
                    └──────────────────────┘
```

**Flow:**
1. Orchestrator calls Payment Service → waits for response
2. If success, calls Inventory Service → waits for response
3. If success, calls Shipping Service → waits for response
4. If any fail, orchestrator triggers compensation

**Characteristics:**
- ✅ Clear control flow
- ✅ Centralized state
- ✅ Easy to debug
- ❌ Single point of failure
- ❌ Orchestrator complexity
- ❌ Tight coupling

---

## Conceptual Orchestrator Code

```typescript
@Injectable()
export class SagaOrchestrator {
  constructor(
    private readonly orderService: OrderService,
    private readonly paymentService: PaymentService,
    private readonly inventoryService: InventoryService,
    private readonly shippingService: ShippingService,
  ) {}

  async executeOrderSaga(orderId: string) {
    const saga = {
      id: uuidv4(),
      orderId,
      status: 'in-progress',
      steps: [],
      startedAt: new Date(),
    };

    try {
      // STEP 1: Process Payment
      console.log('[Orchestrator] Step 1: Processing payment...');
      const payment = await this.paymentService.processPayment(orderId);
      saga.steps.push({ name: 'payment', status: 'success', data: payment });

      // STEP 2: Reserve Inventory
      console.log('[Orchestrator] Step 2: Reserving inventory...');
      const inventory = await this.inventoryService.reserveItems(orderId);
      saga.steps.push({ name: 'inventory', status: 'success', data: inventory });

      // STEP 3: Schedule Shipping
      console.log('[Orchestrator] Step 3: Scheduling shipping...');
      const shipping = await this.shippingService.scheduleShipping(orderId);
      saga.steps.push({ name: 'shipping', status: 'success', data: shipping });

      // SAGA SUCCESS
      saga.status = 'completed';
      saga.completedAt = new Date();
      await this.orderService.completeOrder(orderId);

      console.log('[Orchestrator] ✓ Saga completed successfully');
      return saga;

    } catch (error) {
      // SAGA FAILURE - COMPENSATE
      console.error('[Orchestrator] ✗ Saga failed:', error.message);
      saga.status = 'compensating';
      
      await this.compensate(saga);
      
      saga.status = 'failed';
      saga.failedAt = new Date();
      saga.error = error.message;

      return saga;
    }
  }

  private async compensate(saga: any) {
    console.log('[Orchestrator] Starting compensation...');

    // Compensate in reverse order
    const steps = [...saga.steps].reverse();

    for (const step of steps) {
      try {
        switch (step.name) {
          case 'shipping':
            console.log('[Orchestrator] Compensating: Cancel shipping');
            await this.shippingService.cancelShipping(saga.orderId);
            break;

          case 'inventory':
            console.log('[Orchestrator] Compensating: Release inventory');
            await this.inventoryService.releaseItems(saga.orderId);
            break;

          case 'payment':
            console.log('[Orchestrator] Compensating: Refund payment');
            await this.paymentService.refundPayment(saga.orderId);
            break;
        }
      } catch (compensationError) {
        console.error('[Orchestrator] Compensation failed:', compensationError);
        // In production, this would go to DLQ or manual review
      }
    }

    // Finally, cancel the order
    await this.orderService.cancelOrder(saga.orderId, 'Saga failed');
    console.log('[Orchestrator] Compensation complete');
  }
}
```

---

## Side-by-Side Comparison

### Request/Response Pattern (Orchestration)

```
Orchestrator               Payment Service
     │                           │
     │  POST /process-payment    │
     ├──────────────────────────▶│
     │                           │ (processing...)
     │  200 OK { paymentId }     │
     │◀──────────────────────────┤
     │                           │
```

**Characteristics:**
- Synchronous calls
- Orchestrator waits for response
- Direct service-to-service communication
- Request/response semantics

### Event-Driven Pattern (Choreography)

```
Order Service          Kafka           Payment Service
     │                   │                    │
     │ OrderCreated      │                    │
     ├──────────────────▶│                    │
     │                   │  OrderCreated      │
     │                   ├───────────────────▶│
     │                   │                    │ (processing...)
     │                   │  PaymentCompleted  │
     │                   │◀───────────────────┤
     │                   │                    │
```

**Characteristics:**
- Asynchronous events
- No waiting for response
- Kafka as message broker
- Event semantics

---

## When to Use Each

### Use Choreography When:

✅ **Simple workflows** (2-4 steps)
- Order → Payment → Inventory
- User Registration → Send Email → Create Profile

✅ **Services are independent**
- Each service has clear boundaries
- No complex shared state

✅ **Event-driven architecture**
- Already using Kafka/messaging
- Pub/sub model fits naturally

✅ **Want loose coupling**
- Services don't know about each other
- Easy to add new subscribers

**Example Use Cases:**
- E-commerce order flow (our implementation)
- User onboarding workflow
- Content publication pipeline
- Notification delivery

### Use Orchestration When:

✅ **Complex workflows** (5+ steps)
- Travel booking: Flight + Hotel + Car + Insurance + Payment

✅ **Need saga state**
- Must track progress
- Show status to users
- Resume from failure

✅ **Complex business logic**
- If payment > $1000, require approval
- Different paths based on user tier

✅ **Clear ownership**
- One team owns workflow
- Need centralized control

**Example Use Cases:**
- Loan approval process (multi-step, complex rules)
- Insurance claims processing
- Supply chain coordination
- Complex financial transactions

---

## Hybrid Approach

You can combine both patterns!

```
Orchestrator (for complex workflow)
     │
     │  Uses choreography internally
     │
     ├─▶ Microservice 1 ──┐
     │                     │ Events
     ├─▶ Microservice 2 ◀──┘
     │
     └─▶ Microservice 3
```

**Example:**
- Orchestrator manages high-level saga steps
- Each step uses choreography internally
- Best of both worlds

---

## Summary Table

| Aspect | Choreography | Orchestration |
|--------|--------------|---------------|
| **Coordination** | Decentralized (events) | Centralized (orchestrator) |
| **Communication** | Async (Kafka) | Sync (HTTP) or Async |
| **Coupling** | Loose | Tight |
| **Complexity** | Distributed | Centralized |
| **State** | No central state | Orchestrator tracks state |
| **Failure Handling** | Event-driven compensation | Orchestrator triggers compensation |
| **Testing** | Integration tests | Unit test orchestrator |
| **Visibility** | Hard (distributed logs) | Easy (orchestrator logs) |
| **Single Point of Failure** | No | Yes (orchestrator) |
| **Scalability** | Excellent | Orchestrator can bottleneck |
| **Use Case** | Simple workflows | Complex workflows |

---

## Phase 5 Implementation

**We implemented Choreography because:**
1. ✅ Simple workflow (Order → Payment → Inventory)
2. ✅ Already using Kafka (event-driven)
3. ✅ Want to demonstrate event patterns
4. ✅ Services are independent
5. ✅ No complex branching logic

**For comparison, Orchestration would be used if:**
- ❌ Workflow had 5+ steps
- ❌ Needed to show saga progress to users
- ❌ Complex business rules in workflow
- ❌ Required audit trail of saga execution

---

**Both patterns solve the distributed transaction problem!**

Choose based on:
- Workflow complexity
- Team structure
- Existing architecture
- Debugging requirements
- State tracking needs

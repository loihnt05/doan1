import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaProducerService, KafkaConsumerService } from '../../../libs/kafka';
import {
  Topics,
  ConsumerGroups,
  OrderCreatedEvent,
  PaymentFailedEvent,
  OrderCancelledEvent,
} from '../../../libs/kafka';
import { v4 as uuidv4 } from 'uuid';
import { DistributedLockService } from '../../../libs/distributed-lock';
import { retry, withTimeout } from '../../../libs/reliability-patterns';

@Injectable()
export class OrderServiceService implements OnModuleInit {
  private orders: Map<string, any> = new Map(); // In-memory storage for demo
  
  // Phase 6: Race condition demo variables
  private balance = 1000; // Simulated balance

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly lockService: DistributedLockService,
  ) {}

  /**
   * Subscribe to compensation events
   */
  async onModuleInit() {
    console.log('🚀 Order Service starting Kafka consumer...');

    // Listen for PaymentFailed events (compensation trigger)
    await this.kafkaConsumer.subscribe<PaymentFailedEvent>(
      ConsumerGroups.ORDER_SERVICE,
      [Topics.PAYMENT_FAILED],
      this.handlePaymentFailed.bind(this),
      {
        maxRetries: 3,
        fromBeginning: false,
        autoCommit: true,
        sendToDlqOnFailure: true,
      },
    );

    console.log('✓ Order Service subscribed to payment-failed topic');
  }

  getHello(): string {
    return 'Hello from Order Service!';
  }

  /**
   * Create order and emit OrderCreatedEvent to Kafka - SAGA INITIATION
   * 
   * Saga Choreography Pattern:
   * 1. Order Service creates order → OrderCreatedEvent
   * 2. Payment Service processes payment → PaymentCompleted/Failed
   * 3. If PaymentFailed → Order Service cancels order (COMPENSATION)
   * 4. If PaymentCompleted → Inventory Service reserves items
   */
  async createOrder(orderDto: {
    userId: string;
    items: Array<{ productId: string; quantity: number; price: number }>;
  }) {
    // 1. Business logic: create order
    const orderId = uuidv4();
    const total = orderDto.items.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const order = {
      id: orderId,
      userId: orderDto.userId,
      items: orderDto.items,
      total,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    // Store order (in-memory for demo)
    this.orders.set(orderId, order);

    console.log('✓ [SAGA START] Order created:', order);

    // 2. Create domain event
    const event: OrderCreatedEvent = {
      eventType: 'OrderCreated',
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      data: {
        orderId: order.id,
        userId: order.userId,
        items: order.items,
        total: order.total,
        status: 'pending',
      },
    };

    // 3. Publish event to Kafka
    try {
      await this.kafkaProducer.send(Topics.ORDER_CREATED, event, orderId);
      console.log(`✓ OrderCreatedEvent published for order ${orderId}`);
    } catch (error) {
      console.error('✗ Failed to publish OrderCreatedEvent:', error);
      throw error;
    }

    // 4. Return response immediately (non-blocking)
    return {
      ...order,
      message: 'Order created successfully. Payment processing will begin shortly.',
    };
  }

  /**
   * Handle PaymentFailed event - COMPENSATION ACTION
   * 
   * Compensation in Saga:
   * - Cannot rollback across distributed services
   * - Instead, perform compensating transaction
   * - Cancel order, refund payment, release inventory, etc.
   * 
   * This is the key difference from database transactions:
   * - DB Transaction: Rollback = undo changes
   * - Saga: Compensation = forward action to undo effect
   */
  private async handlePaymentFailed(
    event: PaymentFailedEvent,
    metadata: {
      topic: string;
      partition: number;
      offset: string;
      key: string;
      headers: Record<string, any>;
    },
  ): Promise<void> {
    const orderId = event.data.orderId;
    console.log('\n📨 [SAGA COMPENSATION] Received PaymentFailedEvent:', {
      orderId,
      reason: event.data.reason,
      errorCode: event.data.errorCode,
    });

    // Get order from storage
    const order = this.orders.get(orderId);
    if (!order) {
      console.warn(`⚠ Order ${orderId} not found for cancellation`);
      return;
    }

    // Cancel the order (compensation action)
    order.status = 'cancelled';
    order.cancelledAt = new Date().toISOString();
    order.cancellationReason = event.data.reason;

    this.orders.set(orderId, order);

    console.log(`✗ Order ${orderId} cancelled due to payment failure`);

    // Emit OrderCancelledEvent
    const cancelledEvent: OrderCancelledEvent = {
      eventType: 'OrderCancelled',
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      data: {
        orderId,
        reason: event.data.reason,
        cancelledAt: order.cancelledAt,
      },
    };

    await this.kafkaProducer.send(Topics.ORDER_CANCELLED, cancelledEvent, orderId);
    console.log(`✓ [SAGA COMPENSATION COMPLETE] OrderCancelledEvent published for order ${orderId}\n`);
  }

  /**
   * Get order status (for testing)
   */
  getOrder(orderId: string) {
    return this.orders.get(orderId) || { error: 'Order not found' };
  }
}

// ===================================================================
// EVENT-DRIVEN vs REQUEST-RESPONSE
// ===================================================================
//
// REQUEST-RESPONSE (HTTP):
//   Order Service → (HTTP POST) → Payment Service → (HTTP POST) → Notification Service
//   
//   Problems:
//   - Tight coupling: Order service needs to know payment service URL
//   - Blocking: Order service waits for payment service
//   - Failure cascade: If payment service down, order fails
//   - Timeout issues: Long chain of requests
//
// EVENT-DRIVEN (Kafka):
//   Order Service → Kafka → Payment Service (consumer 1)
//                        → Notification Service (consumer 2)
//                        → Analytics Service (consumer 3)
//   
//   Benefits:
//   - Loose coupling: Services only know about events, not each other
//   - Non-blocking: Order service returns immediately
//   - Resilient: Events stored until consumers ready
//   - Scalable: Multiple consumers per service
//   - Extensible: Add new consumers without changing producers
//
// ===================================================================
// WHEN TO USE EVENT-DRIVEN
// ===================================================================
//
// Use Events When:
//   ✓ Multiple services need to react to same action
//   ✓ Operations are independent (order → payment → shipping)
//   ✓ Eventual consistency is acceptable
//   ✓ High throughput is required
//   ✓ Services can be offline temporarily
//
// Use HTTP When:
//   ✓ Need immediate response (login, search)
//   ✓ Strong consistency required
//   ✓ Simple request-response pattern
//   ✓ Low latency critical
//
// ===================================================================
// TRANSACTIONAL OUTBOX PATTERN
// ===================================================================
//
// Problem: Order saved to DB, but Kafka publish fails
// Result: Order exists but no payment processing started
//
// Solution: Transactional Outbox
//   1. Save order + event to DB in same transaction
//   2. Background job polls outbox table
//   3. Publishes events to Kafka
//   4. Marks as published
//
// Guarantees:
//   - If order saved, event will be published (eventually)
//   - No lost events
//   - At-least-once delivery
//
// ===================================================================

  // ==================== PHASE 6: RACE CONDITION DEMO ====================

  /**
   * DEMO: Race condition - NO LOCK (UNSAFE)
   * 
   * Problem: Multiple requests read-modify-write same variable concurrently
   * Result: Lost updates, inconsistent state
   * 
   * Example Flow (2 concurrent requests):
   * 1. Request A reads balance = 1000
   * 2. Request B reads balance = 1000
   * 3. Request A subtracts 100 → balance = 900
   * 4. Request B subtracts 100 → balance = 900 (WRONG! Should be 800)
   * 
   * This is a "check-then-act" race condition
   */
  async processPaymentNoLock(): Promise<any> {
    const paymentAmount = 100;
    
    // Read balance
    const currentBalance = this.balance;
    
    // Simulate processing delay (makes race condition more visible)
    await this.sleep(50);
    
    // Check if sufficient funds
    if (currentBalance >= paymentAmount) {
      // Deduct amount
      this.balance = currentBalance - paymentAmount;
      
      console.log(`[NO LOCK] Payment processed: -$${paymentAmount}, new balance: $${this.balance}`);
      
      return {
        success: true,
        previousBalance: currentBalance,
        newBalance: this.balance,
        amount: paymentAmount,
        warning: '  Race condition possible! Balance may be incorrect.',
      };
    }
    
    return {
      success: false,
      balance: this.balance,
      message: 'Insufficient funds',
    };
  }

  /**
   * DEMO: Race condition SOLVED - WITH DISTRIBUTED LOCK (SAFE)
   * 
   * Solution: Distributed lock ensures only one process modifies at a time
   * 
   * Flow with lock:
   * 1. Request A acquires lock
   * 2. Request B waits for lock
   * 3. Request A reads, modifies, writes → releases lock
   * 4. Request B acquires lock
   * 5. Request B reads updated balance, modifies, writes → releases lock
   * 
   * Result: Sequential execution, no lost updates
   */
  async processPaymentWithLock(): Promise<any> {
    const lockKey = 'lock:balance';
    const paymentAmount = 100;

    // Acquire distributed lock with retry
    const token = await this.lockService.acquireWithRetry(lockKey, {
      retries: 5,
      retryDelay: 100,
      ttlMs: 5000,
    });

    if (!token) {
      return {
        success: false,
        message: 'Could not acquire lock - system busy',
      };
    }

    try {
      // Critical section starts here
      const currentBalance = this.balance;
      
      // Simulate processing delay
      await this.sleep(50);
      
      if (currentBalance >= paymentAmount) {
        this.balance = currentBalance - paymentAmount;
        
        console.log(`[WITH LOCK] Payment processed: -$${paymentAmount}, new balance: $${this.balance}`);
        
        return {
          success: true,
          previousBalance: currentBalance,
          newBalance: this.balance,
          amount: paymentAmount,
          info: ' Protected by distributed lock',
        };
      }
      
      return {
        success: false,
        balance: this.balance,
        message: 'Insufficient funds',
      };
      
    } finally {
      // Always release lock
      await this.lockService.release(lockKey, token);
    }
  }

  /**
   * DEMO: Fenced tokens to prevent stale writes
   * 
   * Problem: Process acquires lock, pauses (GC, network delay), lock expires,
   *          another process acquires lock, first process resumes and writes stale data
   * 
   * Solution: Fenced tokens
   * - Token increments with each lock acquisition
   * - Before write, check token is still valid
   * - Reject write if token is stale
   * 
   * Example:
   * 1. Worker A gets lock + token 1
   * 2. Worker A pauses (GC pause)
   * 3. Lock expires
   * 4. Worker B gets lock + token 2
   * 5. Worker B writes data (token 2)
   * 6. Worker A resumes, tries to write
   * 7. Token 1 < token 2 → write rejected 
   */
  async processOrderWithFencedToken(orderId: string): Promise<any> {
    const lockKey = `lock:order:${orderId}`;
    const resource = `order:${orderId}`;

    // Get fenced token (monotonically increasing)
    const fencedToken = await this.lockService.getFencedToken(resource);

    // Acquire lock
    const lockToken = await this.lockService.acquire(lockKey, 5000);
    if (!lockToken) {
      return {
        success: false,
        message: 'Could not acquire lock',
      };
    }

    try {
      // Simulate slow processing
      console.log(`[FENCED TOKEN] Worker processing order ${orderId} with token ${fencedToken}`);
      await this.sleep(2000);

      // Before critical write, validate token is still current
      const isValid = await this.lockService.validateFencedToken(resource, fencedToken);
      
      if (!isValid) {
        console.warn(`[FENCED TOKEN] ✗ Stale operation rejected for order ${orderId} (token ${fencedToken})`);
        return {
          success: false,
          message: 'Operation rejected - stale token',
          token: fencedToken,
        };
      }

      // Token is valid, safe to write
      console.log(`[FENCED TOKEN] ✓ Token ${fencedToken} is valid, processing order ${orderId}`);
      
      return {
        success: true,
        message: 'Order processed successfully',
        token: fencedToken,
        orderId,
      };

    } finally {
      await this.lockService.release(lockKey, lockToken);
    }
  }

  /**
   * Get current balance (for demo)
   */
  getBalance() {
    return {
      balance: this.balance,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Reset balance to 1000 (for demo)
   */
  resetBalance() {
    this.balance = 1000;
    return {
      balance: this.balance,
      message: 'Balance reset to $1000',
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

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

@Injectable()
export class OrderServiceService implements OnModuleInit {
  private orders: Map<string, any> = new Map(); // In-memory storage for demo

  constructor(
    private readonly kafkaProducer: KafkaProducerService,
    private readonly kafkaConsumer: KafkaConsumerService,
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


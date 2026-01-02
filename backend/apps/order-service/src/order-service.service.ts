import { Injectable } from '@nestjs/common';
import { KafkaProducerService } from '../../../libs/kafka';
import { Topics, OrderCreatedEvent } from '../../../libs/kafka';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class OrderServiceService {
  constructor(private readonly kafkaProducer: KafkaProducerService) {}

  getHello(): string {
    return 'Hello from Order Service!';
  }

  /**
   * Create order and emit OrderCreatedEvent to Kafka
   * 
   * Event-Driven Flow:
   * 1. Order Service creates order
   * 2. Publishes OrderCreatedEvent to Kafka
   * 3. Payment Service consumes event
   * 4. Notification Service consumes event (different consumer group)
   * 5. Analytics Service consumes event (different consumer group)
   * 
   * Benefits vs HTTP:
   * - Asynchronous: Order service doesn't wait for payment
   * - Decoupled: Services don't need to know about each other
   * - Resilient: If payment service is down, event waits in Kafka
   * - Scalable: Multiple payment service instances can process events
   */
  async createOrder(orderDto: {
    userId: string;
    items: Array<{ productId: string; quantity: number; price: number }>;
  }) {
    // 1. Business logic: create order (database, validation, etc.)
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

    console.log('✓ Order created:', order);

    // 2. Create domain event
    const event: OrderCreatedEvent = {
      eventType: 'OrderCreated',
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      orderId: order.id,
      userId: order.userId,
      items: order.items,
      total: order.total,
    };

    // 3. Publish event to Kafka
    try {
      // Key = orderId ensures all events for same order go to same partition
      // This guarantees ordering: OrderCreated → PaymentProcessed → OrderShipped
      await this.kafkaProducer.send(Topics.ORDER_CREATED, event, orderId);

      console.log(`✓ OrderCreatedEvent published for order ${orderId}`);
    } catch (error) {
      console.error('✗ Failed to publish OrderCreatedEvent:', error);
      // In production, you might want to:
      // - Retry with exponential backoff
      // - Store in outbox table (transactional outbox pattern)
      // - Send alert
      throw error;
    }

    // 4. Return response immediately (don't wait for payment)
    return {
      ...order,
      message: 'Order created successfully. Payment processing will begin shortly.',
    };
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


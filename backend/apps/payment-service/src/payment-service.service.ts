import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService, KafkaProducerService } from '../../../libs/kafka';
import {
  Topics,
  ConsumerGroups,
  OrderCreatedEvent,
  PaymentProcessedEvent,
} from '../../../libs/kafka';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class PaymentServiceService implements OnModuleInit {
  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * Start consuming events when module initializes
   */
  async onModuleInit() {
    console.log('🚀 Payment Service starting Kafka consumer...');

    // Subscribe to OrderCreated events
    await this.kafkaConsumer.subscribe<OrderCreatedEvent>(
      ConsumerGroups.PAYMENT_SERVICE,
      [Topics.ORDER_CREATED],
      this.handleOrderCreated.bind(this),
      {
        maxRetries: 3,
        fromBeginning: false, // Start from latest (set true to replay all)
        autoCommit: true, // Commit offsets automatically
        sendToDlqOnFailure: true, // Send failed messages to DLQ
      },
    );

    console.log('✓ Payment Service subscribed to order-created topic');
  }

  getHello(): string {
    return 'Hello from Payment Service!';
  }

  /**
   * Handle OrderCreated event
   * 
   * Consumer Group Behavior:
   * - Consumer Group: "payment-service"
   * - If multiple payment-service instances running:
   *   - Kafka distributes partitions among them (load balancing)
   *   - Each message processed by only ONE instance
   * - If payment-service instance crashes:
   *   - Kafka rebalances partitions to remaining instances
   *   - Processing continues automatically
   * 
   * Example with 4 partitions, 2 instances:
   *   Instance 1: Partitions 0, 1
   *   Instance 2: Partitions 2, 3
   * 
   * If Instance 1 crashes:
   *   Instance 2: Partitions 0, 1, 2, 3 (takes over all)
   */
  private async handleOrderCreated(
    event: OrderCreatedEvent,
    metadata: {
      topic: string;
      partition: number;
      offset: string;
      key: string;
      headers: Record<string, any>;
    },
  ): Promise<void> {
    console.log('\n📨 Received OrderCreatedEvent:', {
      orderId: event.orderId,
      total: event.total,
      partition: metadata.partition,
      offset: metadata.offset,
    });

    // Idempotency check
    // In production, check if this eventId already processed (Redis, DB, etc.)
    const alreadyProcessed = await this.checkIfProcessed(event.eventId);
    if (alreadyProcessed) {
      console.log(`⏭ Event ${event.eventId} already processed, skipping`);
      return; // Skip duplicate
    }

    // Simulate payment processing
    console.log(`💳 Processing payment for order ${event.orderId}...`);
    await this.sleep(2000); // Simulate API call to payment gateway

    // Random failure for demonstration (10% chance)
    if (Math.random() < 0.1) {
      throw new Error('Payment gateway timeout');
    }

    // Payment successful!
    console.log(`✓ Payment processed successfully for order ${event.orderId}`);

    // Mark as processed (idempotency)
    await this.markAsProcessed(event.eventId);

    // Emit PaymentProcessed event
    const paymentEvent: PaymentProcessedEvent = {
      eventType: 'PaymentProcessed',
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      orderId: event.orderId,
      paymentId: uuidv4(),
      amount: event.total,
      status: 'success',
    };

    await this.kafkaProducer.send(Topics.PAYMENT_PROCESSED, paymentEvent, event.orderId);

    console.log(`✓ PaymentProcessedEvent published for order ${event.orderId}\n`);
  }

  /**
   * Check if event already processed (idempotency)
   * 
   * In production:
   * - Store processed eventIds in Redis with TTL
   * - Or use database with unique constraint
   * - Prevents duplicate processing if consumer restarts before commit
   */
  private async checkIfProcessed(eventId: string): Promise<boolean> {
    // Simplified: in-memory check
    // Production: Redis GET eventId or DB query
    return false;
  }

  /**
   * Mark event as processed (idempotency)
   */
  private async markAsProcessed(eventId: string): Promise<void> {
    // Simplified: no-op
    // Production: Redis SET eventId with TTL or DB insert
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===================================================================
// CONSUMER GROUP PATTERNS
// ===================================================================
//
// 1. COMPETING CONSUMERS (load balancing):
//    Multiple instances, same consumer group
//    
//    Example: 3 payment-service instances
//      Instance A: Partitions 0, 1
//      Instance B: Partitions 2, 3
//      Instance C: Partitions 4, 5
//    
//    Benefits:
//      - Parallel processing
//      - High throughput
//      - Fault tolerance (rebalancing)
//
// 2. MULTIPLE CONSUMER GROUPS (pub/sub):
//    Different services, different consumer groups
//    
//    Example: OrderCreated event
//      payment-service (group A): Processes payment
//      notification-service (group B): Sends email
//      analytics-service (group C): Updates metrics
//    
//    Benefits:
//      - Independent processing
//      - Each service gets all events
//      - Add new consumers without affecting existing
//
// ===================================================================
// IDEMPOTENCY
// ===================================================================
//
// Problem: Consumer crashes after processing but before committing offset
// Result: Kafka redelivers message, payment processed twice
//
// Solution: Idempotency
//   1. Store processed eventIds
//   2. Check before processing
//   3. Skip if already processed
//
// Storage Options:
//   - Redis: Fast, TTL support, but not durable
//   - Database: Durable, but slower
//   - Kafka (exactly-once): Transactional processing
//
// ===================================================================
// ERROR HANDLING IN CONSUMERS
// ===================================================================
//
// Transient Errors (retry):
//   - Network timeout
//   - Database connection lost
//   - External API unavailable
//   Strategy: Retry with backoff
//
// Permanent Errors (don't retry):
//   - Invalid data format
//   - Business rule violation
//   - Data not found
//   Strategy: Log, send to DLQ, alert
//
// Best Practice:
//   1. Try maxRetries times
//   2. If still failing, send to DLQ
//   3. Alert operations team
//   4. Manual investigation/retry
//
// ===================================================================
// AT-LEAST-ONCE vs EXACTLY-ONCE
// ===================================================================
//
// AT-LEAST-ONCE (default, implemented above):
//   - Consumer commits offset AFTER processing
//   - If crash before commit, message redelivered
//   - Same message may be processed multiple times
//   - Solution: Idempotency check
//
// AT-MOST-ONCE:
//   - Consumer commits offset BEFORE processing
//   - If crash during processing, message lost
//   - Never redelivered
//   - Use for: Non-critical data (logs, metrics)
//
// EXACTLY-ONCE:
//   - Kafka transactions
//   - Complex setup
//   - Use for: Financial transactions, critical data
//
// ===================================================================


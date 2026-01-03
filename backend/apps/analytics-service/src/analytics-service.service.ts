import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService } from '../../../libs/kafka';
import {
  Topics,
  ConsumerGroups,
  PaymentCompletedEvent,
  OrderCreatedEvent,
  InventoryReservedEvent,
} from '../../../libs/kafka';

/**
 * Analytics Service - STREAMING PROCESSING DEMO
 * 
 * Demonstrates stateful stream processing:
 * - Aggregates revenue from payment events
 * - Counts orders per minute
 * - Tracks successful vs failed orders
 * 
 * This is streaming (not just messaging):
 * - Messaging: Process individual events
 * - Streaming: Process continuous flow with state
 */
@Injectable()
export class AnalyticsServiceService implements OnModuleInit {
  // Streaming state (in-memory for demo)
  private totalRevenue = 0;
  private orderCount = 0;
  private successfulOrders = 0;
  private failedOrders = 0;
  private ordersPerMinute: number[] = [];
  private lastMinuteTimestamp = Date.now();

  constructor(private readonly kafkaConsumer: KafkaConsumerService) {}

  async onModuleInit() {
    console.log('🚀 Analytics Service starting Kafka consumers...');

    // Subscribe to multiple topics (pub/sub pattern)
    await this.kafkaConsumer.subscribe(
      ConsumerGroups.ANALYTICS_SERVICE,
      [
        Topics.ORDER_CREATED,
        Topics.PAYMENT_COMPLETED,
        Topics.PAYMENT_FAILED,
        Topics.INVENTORY_RESERVED,
      ],
      this.handleEvent.bind(this),
      {
        maxRetries: 3,
        fromBeginning: false,
        autoCommit: true,
        sendToDlqOnFailure: false, // Analytics don't need DLQ
      },
    );

    console.log('✓ Analytics Service subscribed to all events');

    // Start periodic reporting
    this.startPeriodicReporting();
  }

  /**
   * Handle all events - STREAM PROCESSING
   */
  private async handleEvent(
    event: OrderCreatedEvent | PaymentCompletedEvent | any,
    metadata: any,
  ): Promise<void> {
    switch (event.eventType) {
      case 'OrderCreated':
        this.handleOrderCreated(event as OrderCreatedEvent);
        break;
      case 'PaymentCompleted':
        this.handlePaymentCompleted(event as PaymentCompletedEvent);
        break;
      case 'PaymentFailed':
        this.handlePaymentFailed();
        break;
      case 'InventoryReserved':
        this.handleInventoryReserved(event as InventoryReservedEvent);
        break;
    }
  }

  /**
   * STREAMING: Count orders
   */
  private handleOrderCreated(event: OrderCreatedEvent): void {
    this.orderCount++;

    // Time windowing (orders per minute)
    const now = Date.now();
    if (now - this.lastMinuteTimestamp > 60000) {
      this.ordersPerMinute.push(this.orderCount);
      this.lastMinuteTimestamp = now;
      if (this.ordersPerMinute.length > 10) {
        this.ordersPerMinute.shift(); // Keep last 10 minutes
      }
    }
  }

  /**
   * STREAMING: Aggregate revenue
   */
  private handlePaymentCompleted(event: PaymentCompletedEvent): void {
    this.totalRevenue += event.data.amount;
    this.successfulOrders++;
    console.log(`💰 [STREAMING] Total revenue: $${this.totalRevenue.toFixed(2)}`);
  }

  /**
   * STREAMING: Count failures
   */
  private handlePaymentFailed(): void {
    this.failedOrders++;
  }

  /**
   * Track completed orders
   */
  private handleInventoryReserved(event: InventoryReservedEvent): void {
    // Could track inventory turnover, popular products, etc.
  }

  /**
   * Periodic reporting - STREAMING OUTPUT
   */
  private startPeriodicReporting(): void {
    setInterval(() => {
      if (this.orderCount > 0) {
        console.log('\n📊 [STREAMING ANALYTICS REPORT]');
        console.log(`   Total Orders: ${this.orderCount}`);
        console.log(`   Successful: ${this.successfulOrders}`);
        console.log(`   Failed: ${this.failedOrders}`);
        console.log(
          `   Success Rate: ${((this.successfulOrders / this.orderCount) * 100).toFixed(1)}%`,
        );
        console.log(`   Total Revenue: $${this.totalRevenue.toFixed(2)}`);
        console.log(
          `   Avg Order Value: $${(this.totalRevenue / this.successfulOrders || 0).toFixed(2)}`,
        );
        console.log('');
      }
    }, 10000); // Every 10 seconds
  }

  /**
   * Get analytics (API endpoint)
   */
  getAnalytics() {
    return {
      totalOrders: this.orderCount,
      successfulOrders: this.successfulOrders,
      failedOrders: this.failedOrders,
      successRate: this.orderCount > 0 ? (this.successfulOrders / this.orderCount) * 100 : 0,
      totalRevenue: this.totalRevenue,
      averageOrderValue: this.successfulOrders > 0 ? this.totalRevenue / this.successfulOrders : 0,
      ordersPerMinute: this.ordersPerMinute,
    };
  }

  getHello(): string {
    return 'Hello from Analytics Service!';
  }
}

// ===================================================================
// STREAMING vs MESSAGING
// ===================================================================
//
// MESSAGING (Phase 4):
//   - Process individual events
//   - Stateless (or simple state)
//   - Example: Send email on OrderCreated
//
// STREAMING (Phase 5):
//   - Process continuous flow of events
//   - Stateful (aggregate, count, window)
//   - Example: Revenue per hour, orders per minute
//
// ===================================================================
// STREAM PROCESSING PATTERNS
// ===================================================================
//
// 1. AGGREGATION:
//    Sum, count, average over events
//    Example: Total revenue, order count
//
// 2. WINDOWING:
//    Group events by time window
//    Example: Orders per minute, revenue per hour
//
// 3. FILTERING:
//    Select subset of events
//    Example: High-value orders, failed payments
//
// 4. ENRICHMENT:
//    Add context from other sources
//    Example: User profile, product details
//
// 5. JOINING:
//    Combine multiple streams
//    Example: Orders + Payments + Inventory
//
// ===================================================================
// LAMBDA vs KAPPA ARCHITECTURE
// ===================================================================
//
// LAMBDA (Traditional):
//   
//   Events → Batch Layer (accurate, slow)
//          → Speed Layer (approximate, fast)
//   
//   Combined → Serving Layer
//   
//   Pros: Accurate batch + fast real-time
//   Cons: Complex (two systems)
//
// KAPPA (Modern, Kafka-centric):
//   
//   Events → Stream Processor → Serving Layer
//   
//   Pros: Simple (one system)
//   Cons: Need reprocessing capability
//   
//   Most systems today use Kappa
//
// ===================================================================

import { Injectable, OnModuleInit } from '@nestjs/common';
import { KafkaConsumerService, KafkaProducerService } from '../../../libs/kafka';
import {
  Topics,
  ConsumerGroups,
  PaymentCompletedEvent,
  InventoryReservedEvent,
  InventoryFailedEvent,
} from '../../../libs/kafka';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class InventoryServiceService implements OnModuleInit {
  // Simulated inventory stock
  private inventory: Map<string, number> = new Map([
    ['prod-1', 100],
    ['prod-2', 50],
    ['prod-3', 25],
  ]);

  constructor(
    private readonly kafkaConsumer: KafkaConsumerService,
    private readonly kafkaProducer: KafkaProducerService,
  ) {}

  /**
   * Subscribe to PaymentCompleted events
   */
  async onModuleInit() {
    console.log('🚀 Inventory Service starting Kafka consumer...');

    // Subscribe to PaymentCompleted events
    await this.kafkaConsumer.subscribe<PaymentCompletedEvent>(
      ConsumerGroups.INVENTORY_SERVICE,
      [Topics.PAYMENT_COMPLETED],
      this.handlePaymentCompleted.bind(this),
      {
        maxRetries: 3,
        fromBeginning: false,
        autoCommit: true,
        sendToDlqOnFailure: true,
      },
    );

    console.log('✓ Inventory Service subscribed to payment-completed topic');
  }

  getHello(): string {
    return 'Hello from Inventory Service!';
  }

  /**
   * Handle PaymentCompleted event - SAGA CHOREOGRAPHY STEP 3
   * 
   * Saga Flow:
   * 1. Order created → OrderCreatedEvent
   * 2. Payment processed → PaymentCompletedEvent
   * 3. Inventory reserves items → InventoryReserved/Failed ← WE ARE HERE
   * 4. If InventoryFailed → Refund payment (compensation)
   */
  private async handlePaymentCompleted(
    event: PaymentCompletedEvent,
    metadata: {
      topic: string;
      partition: number;
      offset: string;
      key: string;
      headers: Record<string, any>;
    },
  ): Promise<void> {
    const orderId = event.data.orderId;
    console.log('\n📨 [SAGA STEP 3] Received PaymentCompletedEvent:', {
      orderId,
      paymentId: event.data.paymentId,
      amount: event.data.amount,
    });

    // Simulate inventory check
    console.log(`📦 Checking inventory for order ${orderId}...`);
    await this.sleep(1000);

    // Simulate inventory failure (20% chance for demo)
    const inventoryAvailable = Math.random() > 0.2;

    if (inventoryAvailable) {
      // SUCCESS PATH
      await this.reserveInventory(event);
    } else {
      // FAILURE PATH - Trigger compensation
      await this.handleInventoryFailure(event);
    }
  }

  /**
   * Reserve inventory - Continue Saga
   */
  private async reserveInventory(event: PaymentCompletedEvent): Promise<void> {
    const orderId = event.data.orderId;
    const reservationId = uuidv4();

    console.log(`✓ Inventory reserved for order ${orderId}`);

    // Emit InventoryReservedEvent
    const reservedEvent: InventoryReservedEvent = {
      eventType: 'InventoryReserved',
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      data: {
        orderId,
        reservationId,
        items: [
          { productId: 'prod-1', quantity: 2 }, // Would normally get from order
        ],
      },
    };

    await this.kafkaProducer.send(Topics.INVENTORY_RESERVED, reservedEvent, orderId);
    console.log(`✓ [SAGA STEP 4] InventoryReservedEvent published for order ${orderId}\n`);
  }

  /**
   * Inventory failure - Trigger Compensation
   * 
   * Compensation Chain:
   * - InventoryFailed → Refund payment (Payment Service compensation)
   * - Payment refunded → Cancel order (already cancelled)
   */
  private async handleInventoryFailure(event: PaymentCompletedEvent): Promise<void> {
    const orderId = event.data.orderId;

    console.log(`✗ Inventory not available for order ${orderId}`);

    // Emit InventoryFailedEvent → triggers Payment Service to refund
    const failedEvent: InventoryFailedEvent = {
      eventType: 'InventoryFailed',
      eventId: uuidv4(),
      timestamp: new Date().toISOString(),
      data: {
        orderId,
        reason: 'Insufficient stock',
        items: [
          { productId: 'prod-1', requestedQuantity: 2, availableQuantity: 0 },
        ],
      },
    };

    await this.kafkaProducer.send(Topics.INVENTORY_FAILED, failedEvent, orderId);
    console.log(`✗ [SAGA COMPENSATION] InventoryFailedEvent published for order ${orderId}\n`);
  }

  /**
   * Get current inventory (for testing)
   */
  getInventory() {
    return Object.fromEntries(this.inventory);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

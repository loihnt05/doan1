/**
 * Event Types for Message Dispatcher
 * 
 * These types represent events flowing through the system
 * Following event-driven architecture patterns
 */

// ===================================================================
// ORDER EVENTS
// ===================================================================

export interface OrderCreatedEvent {
  eventType: 'OrderCreated';
  eventId: string;
  timestamp: string;
  data: {
    orderId: string;
    userId: string;
    items: Array<{
      productId: string;
      quantity: number;
      price: number;
    }>;
    total: number;
    status: 'pending';
  };
}

export interface OrderConfirmedEvent {
  eventType: 'OrderConfirmed';
  eventId: string;
  timestamp: string;
  data: {
    orderId: string;
    confirmedAt: string;
  };
}

export interface OrderCancelledEvent {
  eventType: 'OrderCancelled';
  eventId: string;
  timestamp: string;
  data: {
    orderId: string;
    reason: string;
    cancelledAt: string;
  };
}

// ===================================================================
// PAYMENT EVENTS
// ===================================================================

export interface PaymentRequestedEvent {
  eventType: 'PaymentRequested';
  eventId: string;
  timestamp: string;
  data: {
    orderId: string;
    amount: number;
    currency: string;
    paymentMethod: string;
  };
}

export interface PaymentProcessedEvent {
  eventType: 'PaymentProcessed';
  eventId: string;
  timestamp: string;
  data: {
    orderId: string;
    paymentId: string;
    amount: number;
    status: 'success' | 'failed';
    transactionId?: string;
    errorMessage?: string;
  };
}

// ===================================================================
// NOTIFICATION EVENTS
// ===================================================================

export interface NotificationRequestedEvent {
  eventType: 'NotificationRequested';
  eventId: string;
  timestamp: string;
  data: {
    userId: string;
    type: 'email' | 'sms' | 'push';
    template: string;
    data: Record<string, any>;
  };
}

// ===================================================================
// DLQ (Dead Letter Queue) EVENT
// ===================================================================

export interface DeadLetterEvent {
  eventType: 'DeadLetter';
  originalEvent: any;
  error: {
    message: string;
    stack?: string;
  };
  metadata: {
    topic: string;
    partition: number;
    offset: string;
    timestamp: string;
    retryCount: number;
  };
}

// ===================================================================
// EVENT UNION TYPE
// ===================================================================

export type DomainEvent =
  | OrderCreatedEvent
  | OrderConfirmedEvent
  | OrderCancelledEvent
  | PaymentRequestedEvent
  | PaymentProcessedEvent
  | NotificationRequestedEvent
  | DeadLetterEvent;

// ===================================================================
// KAFKA MESSAGE ENVELOPE
// ===================================================================

export interface KafkaMessage<T = any> {
  key: string; // For partition routing (e.g., userId, orderId)
  value: T; // Event data
  headers?: Record<string, string>; // Optional metadata
  partition?: number; // Optional: specify partition
  timestamp?: string; // Optional: custom timestamp
}

// ===================================================================
// TOPIC NAMES
// ===================================================================

export const Topics = {
  ORDER_CREATED: 'order-created',
  ORDER_CONFIRMED: 'order-confirmed',
  ORDER_CANCELLED: 'order-cancelled',
  PAYMENT_REQUESTED: 'payment-requested',
  PAYMENT_PROCESSED: 'payment-processed',
  NOTIFICATION_REQUESTED: 'notification-requested',
  
  // Dead Letter Queues
  ORDER_CREATED_DLQ: 'order-created-dlq',
  PAYMENT_REQUESTED_DLQ: 'payment-requested-dlq',
} as const;

export type TopicName = typeof Topics[keyof typeof Topics];

// ===================================================================
// CONSUMER GROUPS
// ===================================================================

export const ConsumerGroups = {
  PAYMENT_SERVICE: 'payment-service-group',
  NOTIFICATION_SERVICE: 'notification-service-group',
  ANALYTICS_SERVICE: 'analytics-service-group',
  AUDIT_SERVICE: 'audit-service-group',
} as const;

export type ConsumerGroupName = typeof ConsumerGroups[keyof typeof ConsumerGroups];

// ===================================================================
// EVENT NAMING CONVENTIONS
// ===================================================================
//
// Past Tense:
//   - OrderCreated (not CreateOrder)
//   - PaymentProcessed (not ProcessPayment)
//   - Events describe what happened, not what should happen
//
// Event Structure:
//   - eventType: Identifies the event type
//   - eventId: Unique identifier for this event (for idempotency)
//   - timestamp: When the event occurred
//   - data: Event-specific payload
//
// Key Selection (for partitioning):
//   - orderId: Ensures all order events go to same partition (ordering)
//   - userId: Ensures all user events go to same partition
//   - Choose key based on what needs to be ordered
//
// ===================================================================
// IDEMPOTENCY
// ===================================================================
//
// Why eventId?
//   - Consumer can track processed eventIds
//   - If same event arrives twice (due to at-least-once), skip it
//   - Store processed eventIds in Redis or DB
//
// Example:
//   ```typescript
//   const processedEvents = new Set<string>();
//   
//   if (processedEvents.has(event.eventId)) {
//     console.log('Event already processed, skipping');
//     return;
//   }
//   
//   // Process event
//   processOrder(event.data);
//   
//   // Mark as processed
//   processedEvents.add(event.eventId);
//   ```
//
// ===================================================================

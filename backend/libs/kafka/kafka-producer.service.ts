import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Producer } from 'kafkajs';
import { createProducer } from './kafka.client';
import { DomainEvent, KafkaMessage, TopicName } from './events.types';
import { v4 as uuidv4 } from 'uuid';

/**
 * Kafka Producer Service
 * 
 * Responsibilities:
 * - Send events to Kafka topics
 * - Handle producer lifecycle (connect/disconnect)
 * - Provide delivery guarantees
 * - Handle errors and retries
 */

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private producer: Producer | null = null;
  private isConnected = false;

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  /**
   * Connect to Kafka
   */
  private async connect(): Promise<void> {
    try {
      this.producer = await createProducer();
      this.isConnected = true;
      console.log('✓ Kafka Producer Service initialized');
    } catch (error) {
      console.error('✗ Failed to connect Kafka Producer:', error);
      // In production, you might want to implement retry logic here
      throw error;
    }
  }

  /**
   * Disconnect from Kafka
   */
  private async disconnect(): Promise<void> {
    if (this.producer && this.isConnected) {
      await this.producer.disconnect();
      this.isConnected = false;
      console.log('✓ Kafka Producer disconnected');
    }
  }

  /**
   * Send a single event to Kafka
   * 
   * @param topic - Kafka topic name
   * @param event - Event data
   * @param key - Partition key (e.g., orderId, userId)
   * @param headers - Optional headers for metadata
   * 
   * Key Concepts:
   * - Key determines partition (same key = same partition = ordering)
   * - If no key provided, round-robin distribution
   * - Headers can carry metadata (tracing IDs, correlation IDs, etc.)
   */
  async send<T extends DomainEvent>(
    topic: TopicName,
    event: T,
    key?: string,
    headers?: Record<string, string>,
  ): Promise<void> {
    if (!this.producer || !this.isConnected) {
      throw new Error('Kafka Producer not connected');
    }

    try {
      const message: KafkaMessage<T> = {
        key: key || uuidv4(), // Use provided key or generate random
        value: event,
        headers: {
          ...headers,
          'event-type': event.eventType,
          'event-id': event.eventId,
          'timestamp': event.timestamp,
        },
      };

      // Send message
      const result = await this.producer.send({
        topic,
        messages: [
          {
            key: message.key,
            value: JSON.stringify(message.value),
            headers: message.headers,
          },
        ],
        // acks: -1 means wait for all in-sync replicas (safest)
        // acks: 1 means wait for leader only (default, balanced)
        // acks: 0 means don't wait (fastest, unsafe)
        acks: 1,
        
        // Timeout for this request
        timeout: 30000,
      });

      console.log(`✓ Event sent to ${topic}:`, {
        eventType: event.eventType,
        eventId: event.eventId,
        partition: result[0].partition,
        offset: result[0].offset,
      });
    } catch (error) {
      console.error(`✗ Failed to send event to ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Send multiple events in a batch (more efficient)
   * 
   * Benefits:
   * - Higher throughput
   * - Lower latency (amortized)
   * - More efficient network usage
   * 
   * Use when:
   * - Bulk operations
   * - Import/export
   * - Batch processing
   */
  async sendBatch<T extends DomainEvent>(
    topic: TopicName,
    events: Array<{ event: T; key?: string }>,
  ): Promise<void> {
    if (!this.producer || !this.isConnected) {
      throw new Error('Kafka Producer not connected');
    }

    try {
      const messages = events.map(({ event, key }) => ({
        key: key || uuidv4(),
        value: JSON.stringify(event),
        headers: {
          'event-type': event.eventType,
          'event-id': event.eventId,
          'timestamp': event.timestamp,
        },
      }));

      const result = await this.producer.send({
        topic,
        messages,
        acks: 1,
        timeout: 30000,
      });

      console.log(`✓ Batch of ${events.length} events sent to ${topic}`);
    } catch (error) {
      console.error(`✗ Failed to send batch to ${topic}:`, error);
      throw error;
    }
  }

  /**
   * Send event to Dead Letter Queue
   * 
   * Dead Letter Queue (DLQ):
   * - Stores messages that failed to process
   * - Allows manual inspection and retry
   * - Prevents poison messages from blocking queue
   * 
   * When to use:
   * - Message processing fails repeatedly
   * - Invalid message format
   * - Business logic errors
   */
  async sendToDeadLetterQueue(
    originalTopic: string,
    originalEvent: any,
    error: Error,
    metadata: {
      partition: number;
      offset: string;
      retryCount: number;
    },
  ): Promise<void> {
    const dlqTopic = `${originalTopic}-dlq` as TopicName;

    const deadLetterEvent = {
      eventType: 'DeadLetter' as const,
      originalEvent,
      error: {
        message: error.message,
        stack: error.stack,
      },
      metadata: {
        topic: originalTopic,
        partition: metadata.partition,
        offset: metadata.offset,
        timestamp: new Date().toISOString(),
        retryCount: metadata.retryCount,
      },
    };

    try {
      await this.send(dlqTopic, deadLetterEvent as any);
      console.log(`✓ Event moved to DLQ: ${dlqTopic}`);
    } catch (dlqError) {
      console.error(`✗ Failed to send to DLQ:`, dlqError);
      // In production, you might want to:
      // - Store in database
      // - Send alert
      // - Log to external system
    }
  }

  /**
   * Check if producer is connected
   */
  isProducerConnected(): boolean {
    return this.isConnected;
  }
}

// ===================================================================
// PRODUCER PATTERNS
// ===================================================================
//
// 1. FIRE AND FORGET (acks=0):
//    producer.send({ acks: 0 });
//    - Fastest
//    - No guarantee
//    - Use for: Metrics, logs
//
// 2. LEADER ACKNOWLEDGMENT (acks=1, default):
//    producer.send({ acks: 1 });
//    - Balanced
//    - Leader confirms write
//    - Use for: Most use cases
//
// 3. ALL REPLICAS (acks=-1):
//    producer.send({ acks: -1 });
//    - Safest
//    - All in-sync replicas confirm
//    - Use for: Critical data (payments, orders)
//
// ===================================================================
// PARTITIONING STRATEGIES
// ===================================================================
//
// 1. KEY-BASED (recommended):
//    send(topic, event, 'order-123');
//    - Same key → same partition → ordering guarantee
//    - Use for: Orders, user events, transactions
//
// 2. ROUND-ROBIN (no key):
//    send(topic, event);
//    - Even distribution
//    - No ordering guarantee
//    - Use for: Independent events, logs
//
// 3. CUSTOM PARTITION:
//    send(topic, event, key, headers, partition);
//    - Full control
//    - Complex logic
//    - Use for: Advanced scenarios
//
// ===================================================================
// ERROR HANDLING
// ===================================================================
//
// Transient Errors (retry):
//   - Network timeout
//   - Leader election
//   - Broker unavailable
//
// Fatal Errors (don't retry):
//   - Invalid message format
//   - Topic doesn't exist (if auto-create disabled)
//   - Authorization failure
//
// Best Practice:
//   - Catch errors
//   - Log with context
//   - Send to DLQ if needed
//   - Alert on persistent failures
//
// ===================================================================

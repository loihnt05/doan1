import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Consumer, EachMessagePayload } from 'kafkajs';
import { createConsumer } from './kafka.client';
import { ConsumerGroupId, TopicName, DomainEvent } from './events.types';
import { KafkaProducerService } from './kafka-producer.service';

/**
 * Kafka Consumer Service
 * 
 * Responsibilities:
 * - Subscribe to Kafka topics
 * - Process messages
 * - Handle errors and retries
 * - Manage offsets
 * - Send failed messages to DLQ
 */

export type MessageHandler<T extends DomainEvent> = (
  event: T,
  metadata: {
    topic: string;
    partition: number;
    offset: string;
    key: string;
    headers: Record<string, any>;
  },
) => Promise<void>;

@Injectable()
export class KafkaConsumerService implements OnModuleDestroy {
  private consumers: Map<string, Consumer> = new Map();

  constructor(private readonly producerService: KafkaProducerService) {}

  async onModuleDestroy() {
    await this.disconnectAll();
  }

  /**
   * Subscribe to a topic and process messages
   * 
   * @param consumerGroupId - Consumer group ID (same group = load balancing)
   * @param topics - Topics to subscribe to
   * @param handler - Function to process each message
   * @param options - Consumer configuration
   * 
   * Consumer Group Concepts:
   * - Same group ID = consumers share partitions (load balancing)
   * - Different group IDs = all consumers get all messages (pub/sub)
   * - One partition = one consumer in a group at a time
   * - Rebalancing happens when consumers join/leave
   */
  async subscribe<T extends DomainEvent>(
    consumerGroupId: ConsumerGroupId,
    topics: TopicName[],
    handler: MessageHandler<T>,
    options: {
      maxRetries?: number;
      fromBeginning?: boolean;
      autoCommit?: boolean;
      sendToDlqOnFailure?: boolean;
    } = {},
  ): Promise<void> {
    const {
      maxRetries = 3,
      fromBeginning = false,
      autoCommit = true,
      sendToDlqOnFailure = true,
    } = options;

    try {
      // Create consumer
      const consumer = await createConsumer(consumerGroupId, {
        // Session timeout: max time between heartbeats
        sessionTimeout: 30000,
        
        // Heartbeat interval: how often to send heartbeats
        heartbeatInterval: 3000,
        
        // Rebalance timeout: max time for rebalancing
        rebalanceTimeout: 60000,
        
        // Enable/disable auto-commit
        autoCommit,
        autoCommitInterval: 5000,
      });

      // Subscribe to topics
      await consumer.subscribe({
        topics,
        fromBeginning,
      });

      console.log(`✓ Consumer ${consumerGroupId} subscribed to:`, topics);

      // Process messages
      await consumer.run({
        eachMessage: async (payload: EachMessagePayload) => {
          await this.processMessage(payload, handler, {
            maxRetries,
            sendToDlqOnFailure,
          });
        },
      });

      // Store consumer for cleanup
      this.consumers.set(consumerGroupId, consumer);
    } catch (error) {
      console.error(`✗ Failed to subscribe consumer ${consumerGroupId}:`, error);
      throw error;
    }
  }

  /**
   * Process a single message with retry logic
   */
  private async processMessage<T extends DomainEvent>(
    payload: EachMessagePayload,
    handler: MessageHandler<T>,
    options: {
      maxRetries: number;
      sendToDlqOnFailure: boolean;
    },
  ): Promise<void> {
    const { topic, partition, message } = payload;
    const offset = message.offset;
    const key = message.key?.toString() || 'no-key';

    let retryCount = 0;
    let lastError: Error | null = null;

    // Parse message
    let event: T;
    try {
      event = JSON.parse(message.value?.toString() || '{}') as T;
    } catch (parseError) {
      console.error(`✗ Failed to parse message from ${topic}:`, parseError);
      // Can't parse = can't retry = send to DLQ immediately
      if (options.sendToDlqOnFailure) {
        await this.producerService.sendToDeadLetterQueue(
          topic,
          message.value?.toString(),
          parseError as Error,
          { partition, offset, retryCount: 0 },
        );
      }
      return; // Skip this message
    }

    // Parse headers
    const headers: Record<string, any> = {};
    if (message.headers) {
      for (const [key, value] of Object.entries(message.headers)) {
        headers[key] = value?.toString();
      }
    }

    // Retry loop
    while (retryCount <= options.maxRetries) {
      try {
        // Call handler
        await handler(event, {
          topic,
          partition,
          offset,
          key,
          headers,
        });

        // Success!
        console.log(`✓ Processed message from ${topic}:`, {
          eventType: event.eventType,
          eventId: event.eventId,
          partition,
          offset,
          retryCount,
        });

        return; // Exit successfully
      } catch (error) {
        lastError = error as Error;
        retryCount++;

        console.warn(`⚠ Failed to process message (attempt ${retryCount}/${options.maxRetries + 1}):`, {
          topic,
          partition,
          offset,
          error: lastError.message,
        });

        // Wait before retry (exponential backoff)
        if (retryCount <= options.maxRetries) {
          const backoffMs = Math.min(1000 * Math.pow(2, retryCount - 1), 10000);
          await this.sleep(backoffMs);
        }
      }
    }

    // All retries failed
    console.error(`✗ Failed to process message after ${retryCount} attempts:`, {
      topic,
      partition,
      offset,
      error: lastError?.message,
    });

    // Send to DLQ
    if (options.sendToDlqOnFailure && lastError) {
      await this.producerService.sendToDeadLetterQueue(
        topic,
        event,
        lastError,
        { partition, offset, retryCount },
      );
    }

    // Note: We don't throw here because we've handled the error
    // If we threw, Kafka would retry from this offset again
    // By not throwing, we commit the offset and move on
  }

  /**
   * Pause consumption from specific topics
   * 
   * Use cases:
   * - Rate limiting
   * - Backpressure handling
   * - Maintenance mode
   */
  async pause(consumerGroupId: ConsumerGroupId, topics: TopicName[]): Promise<void> {
    const consumer = this.consumers.get(consumerGroupId);
    if (consumer) {
      await consumer.pause(topics.map(topic => ({ topic })));
      console.log(`⏸ Consumer ${consumerGroupId} paused topics:`, topics);
    }
  }

  /**
   * Resume consumption from specific topics
   */
  async resume(consumerGroupId: ConsumerGroupId, topics: TopicName[]): Promise<void> {
    const consumer = this.consumers.get(consumerGroupId);
    if (consumer) {
      await consumer.resume(topics.map(topic => ({ topic })));
      console.log(`▶ Consumer ${consumerGroupId} resumed topics:`, topics);
    }
  }

  /**
   * Seek to a specific offset
   * 
   * Use cases:
   * - Replay messages
   * - Skip corrupted messages
   * - Time-travel debugging
   */
  async seek(
    consumerGroupId: ConsumerGroupId,
    topic: TopicName,
    partition: number,
    offset: string,
  ): Promise<void> {
    const consumer = this.consumers.get(consumerGroupId);
    if (consumer) {
      await consumer.seek({ topic, partition, offset });
      console.log(`↻ Consumer ${consumerGroupId} seeked to:`, { topic, partition, offset });
    }
  }

  /**
   * Commit current offsets manually
   * 
   * Use when autoCommit is disabled
   */
  async commitOffsets(
    consumerGroupId: ConsumerGroupId,
    topic: TopicName,
    partition: number,
    offset: string,
  ): Promise<void> {
    const consumer = this.consumers.get(consumerGroupId);
    if (consumer) {
      await consumer.commitOffsets([
        {
          topic,
          partition,
          offset: (parseInt(offset) + 1).toString(), // Commit next offset
        },
      ]);
      console.log(`✓ Committed offset:`, { topic, partition, offset });
    }
  }

  /**
   * Disconnect a specific consumer
   */
  async disconnect(consumerGroupId: ConsumerGroupId): Promise<void> {
    const consumer = this.consumers.get(consumerGroupId);
    if (consumer) {
      await consumer.disconnect();
      this.consumers.delete(consumerGroupId);
      console.log(`✓ Consumer ${consumerGroupId} disconnected`);
    }
  }

  /**
   * Disconnect all consumers
   */
  private async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.consumers.values()).map(consumer =>
      consumer.disconnect(),
    );
    await Promise.all(disconnectPromises);
    this.consumers.clear();
    console.log('✓ All consumers disconnected');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ===================================================================
// CONSUMER PATTERNS
// ===================================================================
//
// 1. LOAD BALANCING (same consumer group):
//    Consumer1(group=payment-service) → Partition 0, 1
//    Consumer2(group=payment-service) → Partition 2, 3
//    - Each message processed once
//    - Partitions distributed among consumers
//    - Use for: Work distribution
//
// 2. PUB/SUB (different consumer groups):
//    Consumer1(group=payment-service) → All messages
//    Consumer2(group=notification-service) → All messages
//    - Each consumer group gets all messages
//    - Independent processing
//    - Use for: Multiple downstream services
//
// 3. REPLAY (seek to offset):
//    consumer.seek({ topic, partition, offset: '0' });
//    - Process messages again
//    - Use for: Bug fixes, data reprocessing
//
// ===================================================================
// OFFSET MANAGEMENT
// ===================================================================
//
// 1. AUTO-COMMIT (default):
//    { autoCommit: true, autoCommitInterval: 5000 }
//    - Offsets committed automatically
//    - Simple, but may lose messages on crash
//    - Use for: Non-critical data
//
// 2. MANUAL COMMIT:
//    { autoCommit: false }
//    await commitOffsets(...);
//    - Full control over when to commit
//    - Commit after successful processing
//    - Use for: Critical data, exactly-once semantics
//
// 3. COMMIT ON REBALANCE:
//    - Auto-commit on consumer leave/join
//    - Prevents duplicate processing
//
// ===================================================================
// ERROR HANDLING STRATEGIES
// ===================================================================
//
// 1. RETRY WITH BACKOFF (implemented above):
//    - Try maxRetries times
//    - Exponential backoff between retries
//    - Send to DLQ after all retries fail
//
// 2. SKIP AND LOG:
//    - Log error
//    - Commit offset
//    - Move to next message
//    - Use for: Non-critical errors
//
// 3. STOP AND ALERT:
//    - Stop consumer
//    - Send alert
//    - Manual intervention required
//    - Use for: Critical errors
//
// 4. CIRCUIT BREAKER:
//    - Stop consuming after N failures
//    - Resume after cooldown
//    - Prevents cascade failures
//
// ===================================================================
// REBALANCING
// ===================================================================
//
// Triggers:
//   - Consumer joins group
//   - Consumer leaves group (crash, shutdown)
//   - Consumer exceeds session timeout
//   - New partition added to topic
//
// During rebalancing:
//   - Consumers stop processing
//   - Partitions reassigned
//   - Processing resumes
//
// Best practices:
//   - Keep processing fast (< session timeout)
//   - Handle rebalancing gracefully
//   - Commit offsets before shutting down
//
// ===================================================================

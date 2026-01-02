import { Kafka, Producer, Consumer, Admin, logLevel } from 'kafkajs';

/**
 * Kafka Client Factory
 * Creates and manages Kafka connections for producers and consumers
 * 
 * Concepts:
 * - clientId: Identifies this application to Kafka
 * - brokers: List of Kafka broker addresses
 * - logLevel: Controls verbosity of Kafka logs
 */

// Kafka broker address
// In Docker: kafka:29092 (internal network)
// From host: localhost:9092
const KAFKA_BROKERS = process.env.KAFKA_BROKERS?.split(',') || ['localhost:9092'];

// Create Kafka client instance
export const kafka = new Kafka({
  clientId: 'nestjs-microservices',
  brokers: KAFKA_BROKERS,
  logLevel: logLevel.ERROR, // Options: NOTHING, ERROR, WARN, INFO, DEBUG
  
  // Connection timeout
  connectionTimeout: 10000,
  
  // Request timeout
  requestTimeout: 30000,
  
  // Retry configuration
  retry: {
    initialRetryTime: 300,
    retries: 8,
  },
});

/**
 * Create a Kafka Producer
 * Producers send messages to Kafka topics
 * 
 * Delivery Guarantees:
 * - acks=0: No acknowledgment (fastest, unsafe)
 * - acks=1: Leader acknowledgment (default, balanced)
 * - acks=-1/all: All replicas acknowledgment (slowest, safest)
 */
export async function createProducer(): Promise<Producer> {
  const producer = kafka.producer({
    // Allow multiple messages in single request
    allowAutoTopicCreation: true,
    
    // Transaction support (for exactly-once semantics)
    // transactionalId: 'my-transactional-producer',
    
    // Max time to wait for acks
    timeout: 30000,
    
    // Compression
    // compression: CompressionTypes.GZIP,
  });

  // Connect to Kafka
  await producer.connect();
  console.log('✓ Kafka Producer connected');

  // Handle disconnection
  producer.on('producer.disconnect', () => {
    console.log('✗ Kafka Producer disconnected');
  });

  return producer;
}

/**
 * Create a Kafka Consumer
 * Consumers read messages from Kafka topics
 * 
 * Consumer Groups:
 * - Consumers with same groupId form a group
 * - Each partition assigned to ONE consumer in group
 * - Enables parallel processing and load balancing
 * 
 * Offset Management:
 * - Offset tracks which messages have been processed
 * - Stored in __consumer_offsets topic
 * - Can be committed automatically or manually
 */
export async function createConsumer(
  groupId: string,
  options?: {
    fromBeginning?: boolean;
    autoCommit?: boolean;
    sessionTimeout?: number;
  },
): Promise<Consumer> {
  const consumer = kafka.consumer({
    groupId,
    
    // Session timeout (consumer heartbeat)
    // If consumer doesn't send heartbeat within this time, it's considered dead
    sessionTimeout: options?.sessionTimeout || 30000,
    
    // Heartbeat interval (must be < sessionTimeout)
    heartbeatInterval: 3000,
    
    // How long to wait for messages when polling
    // Lower = more responsive but more CPU
    // Higher = less CPU but slower to detect new messages
    maxWaitTimeInMs: 5000,
    
    // Maximum bytes per partition to fetch
    maxBytesPerPartition: 1048576, // 1MB
    
    // Retry configuration
    retry: {
      retries: 5,
      initialRetryTime: 300,
    },
  });

  await consumer.connect();
  console.log(`✓ Kafka Consumer connected (group: ${groupId})`);

  // Handle disconnection
  consumer.on('consumer.disconnect', () => {
    console.log(`✗ Kafka Consumer disconnected (group: ${groupId})`);
  });

  // Handle rebalancing (when consumers join/leave group)
  consumer.on('consumer.group_join', ({ payload }) => {
    console.log(`🔄 Consumer group rebalance: ${JSON.stringify(payload.memberAssignment)}`);
  });

  return consumer;
}

/**
 * Create a Kafka Admin client
 * Admin client manages Kafka resources (topics, configs, etc.)
 */
export async function createAdmin(): Promise<Admin> {
  const admin = kafka.admin();
  await admin.connect();
  console.log('✓ Kafka Admin connected');
  return admin;
}

/**
 * Utility: Create topic if it doesn't exist
 */
export async function ensureTopic(
  topicName: string,
  partitions: number = 3,
  replicationFactor: number = 1,
): Promise<void> {
  const admin = await createAdmin();
  
  try {
    const topics = await admin.listTopics();
    
    if (!topics.includes(topicName)) {
      await admin.createTopics({
        topics: [
          {
            topic: topicName,
            numPartitions: partitions,
            replicationFactor,
          },
        ],
      });
      console.log(`✓ Topic created: ${topicName} (${partitions} partitions)`);
    } else {
      console.log(`✓ Topic exists: ${topicName}`);
    }
  } finally {
    await admin.disconnect();
  }
}

/**
 * Utility: Delete topic
 */
export async function deleteTopic(topicName: string): Promise<void> {
  const admin = await createAdmin();
  
  try {
    await admin.deleteTopics({
      topics: [topicName],
    });
    console.log(`✓ Topic deleted: ${topicName}`);
  } finally {
    await admin.disconnect();
  }
}

/**
 * Utility: Get topic metadata
 */
export async function getTopicMetadata(topicName: string): Promise<any> {
  const admin = await createAdmin();
  
  try {
    const metadata = await admin.fetchTopicMetadata({ topics: [topicName] });
    return metadata;
  } finally {
    await admin.disconnect();
  }
}

// ===================================================================
// KAFKA KEY CONCEPTS
// ===================================================================
//
// TOPIC:
//   - Named stream of events (like a database table)
//   - Contains related messages (e.g., order-created, payment-processed)
//   - Durable (messages retained based on retention policy)
//
// PARTITION:
//   - Topic is divided into partitions for parallelism
//   - Each partition is an ordered, immutable log
//   - Messages with same key go to same partition (ordering guarantee)
//   - More partitions = more parallelism
//
// OFFSET:
//   - Position of message in partition (0, 1, 2, ...)
//   - Unique per partition
//   - Consumer tracks which offset it has processed
//   - Can replay messages by resetting offset
//
// PRODUCER:
//   - Sends messages to topics
//   - Chooses partition based on key (or round-robin if no key)
//   - Can wait for acknowledgment (acks config)
//
// CONSUMER:
//   - Reads messages from topics
//   - Part of consumer group for load balancing
//   - Maintains offset position
//   - Can commit offset automatically or manually
//
// CONSUMER GROUP:
//   - Multiple consumers with same groupId
//   - Each partition assigned to ONE consumer in group
//   - Enables horizontal scaling and fault tolerance
//   - Different groups can consume same messages
//
// REBALANCING:
//   - Reassigning partitions when consumers join/leave
//   - Ensures even distribution
//   - May cause brief pause in processing
//
// ===================================================================
// DELIVERY SEMANTICS
// ===================================================================
//
// AT-MOST-ONCE (may lose messages):
//   - Commit offset before processing
//   - If processing fails, message is lost
//   - Fastest but unsafe
//
// AT-LEAST-ONCE (may duplicate messages):
//   - Process message, then commit offset
//   - If consumer crashes after processing but before commit, message reprocessed
//   - Default and recommended
//   - Requires idempotent consumers
//
// EXACTLY-ONCE (no loss, no duplication):
//   - Requires transactional producer and consumer
//   - Kafka Streams or custom implementation
//   - Complex but provides strongest guarantee
//
// ===================================================================

import { Module, Global } from '@nestjs/common';
import { KafkaProducerService } from './kafka-producer.service';
import { KafkaConsumerService } from './kafka-consumer.service';

/**
 * Kafka Module
 * 
 * Provides Kafka producer and consumer services globally
 * @Global decorator makes this module available everywhere
 */
@Global()
@Module({
  providers: [KafkaProducerService, KafkaConsumerService],
  exports: [KafkaProducerService, KafkaConsumerService],
})
export class KafkaModule {}

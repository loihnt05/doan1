import { Module } from '@nestjs/common';
import { CacheStrategiesController } from './cache-strategies.controller';
import { CacheStrategiesService } from './cache-strategies.service';

@Module({
  imports: [],
  controllers: [CacheStrategiesController],
  providers: [CacheStrategiesService],
  exports: [CacheStrategiesService],
})
export class CacheStrategiesModule {}

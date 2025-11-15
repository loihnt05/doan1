import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { redisStore } from 'cache-manager-redis-store';
import { CacheModule } from '@nestjs/cache-manager/dist/cache.module';
import { RedisController } from './redis.controller';

@Module({
  imports: [
    CacheModule.register({ store: redisStore, host: 'localhost', port: 6379 }),
  ],
  controllers: [RedisController],
  providers: [RedisService],
})
export class RedisModule {}

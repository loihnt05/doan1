import { Module } from '@nestjs/common';
import { RedisService } from './redis.service';
import { redisStore } from 'cache-manager-redis-yet';
import { RedisController } from './redis.controller';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    CacheModule.register({
      useFactory: () => ({
        store: redisStore,
        host: 'localhost',
        port: 6379,
        ttl: 60000,
      }),
    }),
  ],
  controllers: [RedisController],
  providers: [RedisService],
})
export class RedisModule {}

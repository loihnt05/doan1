import { Module } from '@nestjs/common';
import { RedisController } from './redis.controller';
import { RedisService } from './redis.service';
import { CacheModule } from '@nestjs/cache-manager';
import Keyv from 'keyv';
import { CacheableMemory } from 'cacheable';
import KeyvRedis from '@keyv/redis';

@Module({
  imports: [
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    CacheModule.registerAsync({
      useFactory: () => ({
        stores: [
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call
          new Keyv({
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
            store: new CacheableMemory({ ttl: 60_000, lruSize: 5000 }),
          }),
          new KeyvRedis('redis://localhost:6379'),
        ],
      }),
    }),
  ],
  controllers: [RedisController],
  providers: [RedisService],
})
export class RedisModule {}

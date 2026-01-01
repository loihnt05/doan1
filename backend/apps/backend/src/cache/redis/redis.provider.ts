import { createClient } from 'redis';
import type { RedisClientType } from 'redis';

export const REDIS = 'REDIS_CLIENT';

export const redisProvider: {
  provide: string;
  useFactory: () => Promise<RedisClientType>;
} = {
  provide: REDIS,
  useFactory: async () => {
    const client: RedisClientType = createClient({
      url: 'redis://localhost:6379',
    });
    await client.connect();
    return client;
  },
};

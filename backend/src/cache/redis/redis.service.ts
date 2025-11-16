import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';

@Injectable()
export class RedisService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async getNumberCache() {
    const key = 'number';

    const cached = await this.cacheManager.get<number>(key);

    if (cached !== undefined && cached !== null) {
      return {
        data: cached,
        fromCache: true,
      };
    }

    const randomNum = Math.floor(Math.random() * 1000);
    await this.cacheManager.set(key, randomNum, 60000);

    return {
      data: randomNum,
      fromCache: false,
    };
  }

  async setCacheKey() {
    const key = 'my-key';
    const value = 'my-value';

    console.log('Setting cache key:', key, 'with value:', value);
    await this.cacheManager.set(key, value, 60000);

    // Verify it was set
    const verify = await this.cacheManager.get(key);
    console.log('Verification after set:', verify);

    return {
      message: `Cache key '${key}' set successfully.`,
      verified: verify,
    };
  }

  async getCacheKey() {
    const key = 'my-key';
    console.log('Getting cache key:', key);
    const value = await this.cacheManager.get<string>(key);
    console.log('Retrieved value:', value);

    if (value) {
      return { key, value };
    }
    return { message: `Cache key '${key}' not found.` };
  }
}

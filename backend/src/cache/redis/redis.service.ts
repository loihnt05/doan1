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
}

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Controller, Get, Inject, Post } from '@nestjs/common';
import type { Cache } from 'cache-manager';

@Controller('redis')
export class RedisController {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  @Get('get-number-cache')
  async getNumberCache(): Promise<any> {
    const val = await this.cacheManager.get<number>('number');

    if (val !== undefined && val !== null) {
      return {
        data: val,
        FromRedis: 'This is loaded from redis cache',
      };
    }

    const randomNum = Math.floor(Math.random() * 1000);
    await this.cacheManager.set('number', randomNum, 10000);
    return {
      data: randomNum,
      FromRedis: 'This is loaded from randomNumDbs',
    };
  }

  @Post('clear-number-cache')
  async clearNumberCache(): Promise<{ message: string }> {
    await this.cacheManager.del('number');
    return {
      message: 'Number cache cleared successfully',
    };
  }

  @Get('all-keys')
  async getAllKeys(): Promise<string> {
    for (const store of this.cacheManager.stores) {
      const storeIterator = store?.iterator;
      if (storeIterator) {
        for await (const [key, value] of storeIterator('namespace')) {
          console.log(key, value);
        }
      }
    }
    return 'See console for all keys';
  }
}

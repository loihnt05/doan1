import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Controller, Get, Inject } from '@nestjs/common';
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
    await this.cacheManager.set('number', randomNum, 1000);
    return {
      data: randomNum,
      FromRedis: 'This is loaded from randomNumDbs',
    };
  }
}

import { Controller, Get, Post, UseInterceptors } from '@nestjs/common';
import { RedisService } from './redis.service';
import { CacheInterceptor, CacheTTL } from '@nestjs/cache-manager';

@Controller('redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Get('get-number-cache')
  @UseInterceptors(CacheInterceptor)
  @CacheTTL(60)
  getNumberCache() {
    return this.redisService.getNumberCache();
  }

  @Post('set-cache-key')
  setCacheKey() {
    return this.redisService.setCacheKey();
  }

  @Get('get-cache-key')
  getCacheKey() {
    return this.redisService.getCacheKey();
  }
}

import { Body, Controller, Get, Param, Post, UseInterceptors } from '@nestjs/common';
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

  @Get('string/:key')
  getString(@Param('key') key: string) {
    return this.redisService.getString(key);
  }

  @Post('string/:key/:value/:ttl')
  setString(
    @Param('key') key: string,
    @Param('value') value: string,
    @Param('ttl') ttl?: number,
  ) {
    return this.redisService.setString(key, value, ttl);
  }

  @Get('hash/:key')
  getHash(@Param('key') key: string) {
    return this.redisService.getHash(key);
  }
  @Post('hash/:key')
  setHash(
    @Param('key') key: string,
    @Body('field') field: string,
    @Body('value') value: string,
  ) {
    return this.redisService.setHash(key, field, value);
  }

  @Get('list/:key')
  getList(@Param('key') key: string) {
    return this.redisService.getList(key);
  }

  @Get('set/:key')
  getSet(@Param('key') key: string) {
    return this.redisService.getSet(key);
  }

  @Get('zset/:key')
  getZSet(@Param('key') key: string) {
    return this.redisService.getSortedSet(key);
  }
}

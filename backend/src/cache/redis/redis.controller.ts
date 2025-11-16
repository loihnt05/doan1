import { Controller, Get } from '@nestjs/common';
import { RedisService } from './redis.service';

@Controller('redis')
export class RedisController {
  constructor(private readonly redisService: RedisService) {}

  @Get('get-number-cache')
  getNumberCache() {
    return this.redisService.getNumberCache();
  }
}

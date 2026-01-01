import { Controller, Get, Post, Delete, Body, Param } from '@nestjs/common';
import { MemcachedService } from './memcached.service';

@Controller('memcached')
export class MemcachedController {
  constructor(private readonly memcachedService: MemcachedService) {}

  @Post('set')
  async setValue(
    @Body('key') key: string,
    @Body('value') value: unknown,
    @Body('ttl') ttl?: number,
  ) {
    const result = await this.memcachedService.set(key, value, ttl);
    return {
      success: result,
      message: `Key '${key}' has been set`,
    };
  }

  @Get('get/:key')
  async getValue(@Param('key') key: string) {
    const value = await this.memcachedService.get(key);
    return {
      key,
      value,
      found: value !== null,
    };
  }

  @Delete('delete/:key')
  async deleteValue(@Param('key') key: string) {
    const result = await this.memcachedService.delete(key);
    return {
      success: result,
      message: `Key '${key}' has been deleted`,
    };
  }

  @Post('add')
  async addValue(
    @Body('key') key: string,
    @Body('value') value: unknown,
    @Body('ttl') ttl?: number,
  ) {
    const result = await this.memcachedService.add(key, value, ttl);
    return {
      success: result,
      message: `Key '${key}' has been added`,
    };
  }

  @Post('replace')
  async replaceValue(
    @Body('key') key: string,
    @Body('value') value: unknown,
    @Body('ttl') ttl?: number,
  ) {
    const result = await this.memcachedService.replace(key, value, ttl);
    return {
      success: result,
      message: `Key '${key}' has been replaced`,
    };
  }

  @Post('get-multi')
  async getMultipleValues(@Body('keys') keys: string[]) {
    const values = await this.memcachedService.getMulti(keys);
    return {
      values,
      count: Object.keys(values).length,
    };
  }

  @Post('increment')
  async incrementValue(
    @Body('key') key: string,
    @Body('amount') amount: number = 1,
  ) {
    const result = await this.memcachedService.increment(key, amount);
    return {
      key,
      newValue: result,
      success: result !== false,
    };
  }

  @Post('decrement')
  async decrementValue(
    @Body('key') key: string,
    @Body('amount') amount: number = 1,
  ) {
    const result = await this.memcachedService.decrement(key, amount);
    return {
      key,
      newValue: result,
      success: result !== false,
    };
  }

  @Post('flush')
  async flushAll() {
    const result = await this.memcachedService.flush();
    return {
      success: result,
      message: 'All data has been flushed from memcached',
    };
  }

  @Get('stats')
  async getStats(): Promise<{ stats: Record<string, unknown> }> {
    const stats = await this.memcachedService.stats();
    return {
      stats,
    };
  }
}

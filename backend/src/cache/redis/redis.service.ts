import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable } from '@nestjs/common';
import type { Cache } from 'cache-manager';
import type { RedisClientType } from 'redis';
import { REDIS } from './redis.provider';

@Injectable()
export class RedisService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(REDIS) private redis: RedisClientType,
  ) {}

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
  //string
  async setString(key: string, value: string, ttl?: number) {
    if (ttl) {
      await this.cacheManager.set(key, value, ttl);
      return { message: `Key '${key}' set with TTL of ${ttl} seconds.` };
    }
    await this.cacheManager.set(key, value);
    return { message: `Key '${key}' set without TTL.` };
  }
  async getString(key: string) {
    console.log('Getting string for key:', key);
    return await this.cacheManager.get<string>(key);
  }
  //hash
  async getHash(key: string) {
    console.log('Getting hash for key:', key);
    return await this.redis.hGetAll(key);
  }
  async setHash(key: string, field: string, value: string) {
    if (!field || !value) {
      throw new Error(`field and value must be provided`);
    }
    console.log(
      `Setting hash field '${field}' for key '${key}' with value:`,
      value,
    );
    await this.redis.hSet(key, field, value);
    return { message: `Field '${field}' set for hash key '${key}'.` };
  }
  //list
  async setList(key: string, values: string[]) {
    console.log('Setting list for key:', key, 'with values:', values);
    await this.redis.rPush(key, values);
    return { message: `List set for key '${key}'.` };
  }
  async getList(key: string) {
    console.log('Getting list for key:', key);
    return await this.redis.lRange(key, 0, -1);
  }
  //set
  async getSet(key: string) {
    console.log('Getting set for key:', key);
    return await this.redis.sMembers(key);
  }
  //sorted set
  async getSortedSet(key: string) {
    console.log('Getting sorted set for key:', key);
    return await this.redis.zRangeWithScores(key, 0, -1);
  }
}

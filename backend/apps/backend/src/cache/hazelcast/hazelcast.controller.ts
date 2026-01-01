import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { HazelcastService } from './hazelcast.service';

@Controller('hazelcast')
export class HazelcastController {
  constructor(private readonly hazelcastService: HazelcastService) {}

  /**
   * Get a value from a Hazelcast map
   * GET /hazelcast/:mapName/:key
   */
  @Get(':mapName/:key')
  async get(@Param('mapName') mapName: string, @Param('key') key: string) {
    const value = await this.hazelcastService.get(mapName, key);
    return { mapName, key, value };
  }

  /**
   * Set a value in a Hazelcast map
   * POST /hazelcast/:mapName/:key
   * Body: { value: any, ttl?: number }
   */
  @Post(':mapName/:key')
  async set(
    @Param('mapName') mapName: string,
    @Param('key') key: string,
    @Body('value') value: unknown,
    @Body('ttl') ttl?: number,
  ) {
    await this.hazelcastService.set(mapName, key, value, ttl);
    return {
      message: `Successfully set key '${key}' in map '${mapName}'`,
      ttl: ttl || 'no expiration',
    };
  }

  /**
   * Delete a key from a Hazelcast map
   * DELETE /hazelcast/:mapName/:key
   */
  @Delete(':mapName/:key')
  async delete(@Param('mapName') mapName: string, @Param('key') key: string) {
    await this.hazelcastService.delete(mapName, key);
    return {
      message: `Successfully deleted key '${key}' from map '${mapName}'`,
    };
  }

  /**
   * Check if a key exists in a Hazelcast map
   * GET /hazelcast/:mapName/:key/exists
   */
  @Get(':mapName/:key/exists')
  async containsKey(
    @Param('mapName') mapName: string,
    @Param('key') key: string,
  ) {
    const exists = await this.hazelcastService.containsKey(mapName, key);
    return { mapName, key, exists };
  }

  /**
   * Get all entries from a Hazelcast map
   * GET /hazelcast/:mapName/entries
   */
  @Get(':mapName/entries')
  async getAllEntries(@Param('mapName') mapName: string) {
    const entries = await this.hazelcastService.getAllEntries(mapName);
    return {
      mapName,
      count: entries.length,
      entries: entries.map(([key, value]) => ({ key, value })),
    };
  }

  /**
   * Get all keys from a Hazelcast map
   * GET /hazelcast/:mapName/keys
   */
  @Get(':mapName/keys')
  async getKeys(@Param('mapName') mapName: string) {
    const keys = await this.hazelcastService.getKeys(mapName);
    return { mapName, count: keys.length, keys };
  }

  /**
   * Get all values from a Hazelcast map
   * GET /hazelcast/:mapName/values
   */
  @Get(':mapName/values')
  async getValues(@Param('mapName') mapName: string) {
    const values = await this.hazelcastService.getValues(mapName);
    return { mapName, count: values.length, values };
  }

  /**
   * Get the size of a Hazelcast map
   * GET /hazelcast/:mapName/size
   */
  @Get(':mapName/size')
  async getSize(@Param('mapName') mapName: string) {
    const size = await this.hazelcastService.getSize(mapName);
    return { mapName, size };
  }

  /**
   * Clear all entries from a Hazelcast map
   * DELETE /hazelcast/:mapName/clear
   */
  @Delete(':mapName/clear')
  async clear(@Param('mapName') mapName: string) {
    await this.hazelcastService.clear(mapName);
    return { message: `Successfully cleared map '${mapName}'` };
  }

  /**
   * Put if absent - only set if key doesn't exist
   * POST /hazelcast/:mapName/:key/if-absent
   * Body: { value: any, ttl?: number }
   */
  @Post(':mapName/:key/if-absent')
  async putIfAbsent(
    @Param('mapName') mapName: string,
    @Param('key') key: string,
    @Body('value') value: unknown,
    @Body('ttl') ttl?: number,
  ) {
    const previousValue = await this.hazelcastService.putIfAbsent(
      mapName,
      key,
      value,
      ttl,
    );
    return {
      message: previousValue
        ? `Key '${key}' already exists in map '${mapName}'`
        : `Successfully set key '${key}' in map '${mapName}'`,
      previousValue,
    };
  }

  /**
   * Get multiple values from a Hazelcast map
   * GET /hazelcast/:mapName/multiple?keys=key1,key2,key3
   */
  @Get(':mapName/multiple')
  async getMultiple(
    @Param('mapName') mapName: string,
    @Query('keys') keysParam: string,
  ) {
    const keys = keysParam.split(',');
    const result = await this.hazelcastService.getMultiple(mapName, keys);
    return {
      mapName,
      requested: keys.length,
      found: result.size,
      values: Object.fromEntries(result),
    };
  }
}

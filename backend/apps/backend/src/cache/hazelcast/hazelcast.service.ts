import { Injectable, OnModuleDestroy, Inject, Logger } from '@nestjs/common';
import type { Client, IMap } from 'hazelcast-client';
import { HAZELCAST } from './hazelcast.provider';

@Injectable()
export class HazelcastService implements OnModuleDestroy {
  private readonly logger = new Logger(HazelcastService.name);

  constructor(@Inject(HAZELCAST) private client: Client) {
    this.logger.log('Hazelcast client initialized');
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.shutdown();
      this.logger.log('Hazelcast client connection closed');
    }
  }

  /**
   * Get a map from Hazelcast
   */
  private async getMap<K, V>(mapName: string): Promise<IMap<K, V>> {
    return await this.client.getMap<K, V>(mapName);
  }

  /**
   * Get a value from a Hazelcast map
   */
  async get<T>(mapName: string, key: string): Promise<T | null> {
    try {
      const map = await this.getMap<string, T>(mapName);
      const value = await map.get(key);
      return value || null;
    } catch (err) {
      this.logger.error(`Error getting key ${key} from map ${mapName}:`, err);
      throw new Error(
        `Failed to get key ${key} from map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Set a value in a Hazelcast map
   * @param mapName - The name of the map
   * @param key - The key to store
   * @param value - The value to store
   * @param ttl - Time to live in milliseconds (optional)
   */
  async set(
    mapName: string,
    key: string,
    value: unknown,
    ttl?: number,
  ): Promise<boolean> {
    try {
      const map = await this.getMap<string, unknown>(mapName);
      if (ttl) {
        await map.set(key, value, ttl);
        this.logger.debug(
          `Successfully set key ${key} in map ${mapName} with TTL ${ttl}ms`,
        );
      } else {
        await map.set(key, value);
        this.logger.debug(`Successfully set key ${key} in map ${mapName}`);
      }
      return true;
    } catch (err) {
      this.logger.error(`Error setting key ${key} in map ${mapName}:`, err);
      throw new Error(
        `Failed to set key ${key} in map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Delete a key from a Hazelcast map
   */
  async delete(mapName: string, key: string): Promise<boolean> {
    try {
      const map = await this.getMap<string, unknown>(mapName);
      await map.delete(key);
      this.logger.debug(`Successfully deleted key ${key} from map ${mapName}`);
      return true;
    } catch (err) {
      this.logger.error(`Error deleting key ${key} from map ${mapName}:`, err);
      throw new Error(
        `Failed to delete key ${key} from map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Check if a key exists in a Hazelcast map
   */
  async containsKey(mapName: string, key: string): Promise<boolean> {
    try {
      const map = await this.getMap<string, unknown>(mapName);
      return await map.containsKey(key);
    } catch (err) {
      this.logger.error(`Error checking key ${key} in map ${mapName}:`, err);
      throw new Error(
        `Failed to check key ${key} in map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get all entries from a Hazelcast map
   */
  async getAllEntries<T>(mapName: string): Promise<Array<[string, T]>> {
    try {
      const map = await this.getMap<string, T>(mapName);
      const entries = await map.entrySet();
      return entries.map((entry) => [entry[0], entry[1]]);
    } catch (err) {
      this.logger.error(`Error getting all entries from map ${mapName}:`, err);
      throw new Error(
        `Failed to get all entries from map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get all keys from a Hazelcast map
   */
  async getKeys(mapName: string): Promise<string[]> {
    try {
      const map = await this.getMap<string, unknown>(mapName);
      return await map.keySet();
    } catch (err) {
      this.logger.error(`Error getting keys from map ${mapName}:`, err);
      throw new Error(
        `Failed to get keys from map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get all values from a Hazelcast map
   */
  async getValues<T>(mapName: string): Promise<T[]> {
    try {
      const map = await this.getMap<string, T>(mapName);
      // Convert entries to values array
      const entries = await map.entrySet();
      return entries.map((entry) => entry[1]);
    } catch (err) {
      this.logger.error(`Error getting values from map ${mapName}:`, err);
      throw new Error(
        `Failed to get values from map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get the size of a Hazelcast map
   */
  async getSize(mapName: string): Promise<number> {
    try {
      const map = await this.getMap<string, unknown>(mapName);
      return await map.size();
    } catch (err) {
      this.logger.error(`Error getting size of map ${mapName}:`, err);
      throw new Error(
        `Failed to get size of map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Clear all entries from a Hazelcast map
   */
  async clear(mapName: string): Promise<boolean> {
    try {
      const map = await this.getMap<string, unknown>(mapName);
      await map.clear();
      this.logger.log(`Successfully cleared map ${mapName}`);
      return true;
    } catch (err) {
      this.logger.error(`Error clearing map ${mapName}:`, err);
      throw new Error(
        `Failed to clear map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Put if absent - only set if key doesn't exist
   */
  async putIfAbsent(
    mapName: string,
    key: string,
    value: unknown,
    ttl?: number,
  ): Promise<unknown> {
    try {
      const map = await this.getMap<string, unknown>(mapName);
      if (ttl) {
        const result = await map.putIfAbsent(key, value, ttl);
        return result || null;
      } else {
        const result = await map.putIfAbsent(key, value);
        return result || null;
      }
    } catch (err) {
      this.logger.error(
        `Error putting if absent key ${key} in map ${mapName}:`,
        err,
      );
      throw new Error(
        `Failed to put if absent key ${key} in map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get multiple values from a Hazelcast map
   */
  async getMultiple<T>(
    mapName: string,
    keys: string[],
  ): Promise<Map<string, T>> {
    try {
      const map = await this.getMap<string, T>(mapName);
      const result = new Map<string, T>();

      await Promise.all(
        keys.map(async (key) => {
          const value = await map.get(key);
          if (value !== null && value !== undefined) {
            result.set(key, value);
          }
        }),
      );

      return result;
    } catch (err) {
      this.logger.error(
        `Error getting multiple keys from map ${mapName}:`,
        err,
      );
      throw new Error(
        `Failed to get multiple keys from map ${mapName}: ${err instanceof Error ? err.message : 'Unknown error'}`,
      );
    }
  }
}

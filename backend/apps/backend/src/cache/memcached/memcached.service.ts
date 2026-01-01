import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import Memcached from 'memcached';
import {
  FailureDetails,
  ReconnectingDetails,
  MemcachedClient,
} from './memcached.types';
import { MEMCACHED_CONFIG } from './memcached.config';

@Injectable()
export class MemcachedService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MemcachedService.name);
  private memcached!: MemcachedClient;

  onModuleInit() {
    // TypeScript doesn't have built-in types for memcached, so we cast to our interface
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    this.memcached = new Memcached(
      MEMCACHED_CONFIG.servers,
      MEMCACHED_CONFIG.options,
    ) as unknown as MemcachedClient;

    this.memcached.on('failure', (details: FailureDetails) => {
      this.logger.error(
        `Server ${details.server} went down due to: ${details.messages.join('')}`,
      );
    });

    this.memcached.on('reconnecting', (details: ReconnectingDetails) => {
      this.logger.log(
        `Total downtime caused by server ${details.server} : ${details.totalDownTime}ms`,
      );
    });

    this.logger.log('Memcached client initialized');
  }

  onModuleDestroy() {
    if (this.memcached) {
      this.memcached.end();
      this.logger.log('Memcached client connection closed');
    }
  }

  /**
   * Get a value from memcached
   */
  async get<T>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      this.memcached.get(key, (err: Error | undefined, data: T) => {
        if (err) {
          this.logger.error(`Error getting key ${key}:`, err);
          reject(new Error(`Failed to get key ${key}: ${err.message}`));
        } else {
          resolve(data || null);
        }
      });
    });
  }

  /**
   * Set a value in memcached
   * @param key - The key to store
   * @param value - The value to store
   * @param lifetime - Time to live in seconds (default: 3600)
   */
  async set(
    key: string,
    value: unknown,
    lifetime: number = 3600,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.memcached.set(key, value, lifetime, (err: Error | undefined) => {
        if (err) {
          this.logger.error(`Error setting key ${key}:`, err);
          reject(new Error(`Failed to set key ${key}: ${err.message}`));
        } else {
          this.logger.debug(`Successfully set key ${key}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Delete a key from memcached
   */
  async delete(key: string): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.memcached.del(key, (err: Error | undefined) => {
        if (err) {
          this.logger.error(`Error deleting key ${key}:`, err);
          reject(new Error(`Failed to delete key ${key}: ${err.message}`));
        } else {
          this.logger.debug(`Successfully deleted key ${key}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Add a value to memcached (only if key doesn't exist)
   */
  async add(
    key: string,
    value: unknown,
    lifetime: number = 3600,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.memcached.add(key, value, lifetime, (err: Error | undefined) => {
        if (err) {
          this.logger.error(`Error adding key ${key}:`, err);
          reject(new Error(`Failed to add key ${key}: ${err.message}`));
        } else {
          this.logger.debug(`Successfully added key ${key}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Replace a value in memcached (only if key exists)
   */
  async replace(
    key: string,
    value: unknown,
    lifetime: number = 3600,
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.memcached.replace(key, value, lifetime, (err: Error | undefined) => {
        if (err) {
          this.logger.error(`Error replacing key ${key}:`, err);
          reject(new Error(`Failed to replace key ${key}: ${err.message}`));
        } else {
          this.logger.debug(`Successfully replaced key ${key}`);
          resolve(true);
        }
      });
    });
  }

  /**
   * Get multiple values from memcached
   */
  async getMulti<T>(keys: string[]): Promise<Record<string, T>> {
    return new Promise((resolve, reject) => {
      this.memcached.getMulti(
        keys,
        (err: Error | undefined, data: Record<string, T>) => {
          if (err) {
            this.logger.error(`Error getting multiple keys:`, err);
            reject(new Error(`Failed to get multiple keys: ${err.message}`));
          } else {
            resolve(data || {});
          }
        },
      );
    });
  }

  /**
   * Increment a numeric value
   */
  async increment(key: string, amount: number = 1): Promise<number | false> {
    return new Promise((resolve, reject) => {
      this.memcached.incr(
        key,
        amount,
        (err: Error | undefined, result: number | false) => {
          if (err) {
            this.logger.error(`Error incrementing key ${key}:`, err);
            reject(new Error(`Failed to increment key ${key}: ${err.message}`));
          } else {
            resolve(result);
          }
        },
      );
    });
  }

  /**
   * Decrement a numeric value
   */
  async decrement(key: string, amount: number = 1): Promise<number | false> {
    return new Promise((resolve, reject) => {
      this.memcached.decr(
        key,
        amount,
        (err: Error | undefined, result: number | false) => {
          if (err) {
            this.logger.error(`Error decrementing key ${key}:`, err);
            reject(new Error(`Failed to decrement key ${key}: ${err.message}`));
          } else {
            resolve(result);
          }
        },
      );
    });
  }

  /**
   * Flush all data from memcached
   */
  async flush(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      this.memcached.flush((err: Error | undefined) => {
        if (err) {
          this.logger.error('Error flushing memcached:', err);
          reject(new Error(`Failed to flush memcached: ${err.message}`));
        } else {
          this.logger.log('Successfully flushed memcached');
          resolve(true);
        }
      });
    });
  }

  /**
   * Get server statistics
   */
  async stats(): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      this.memcached.stats(
        (err: Error | undefined, stats: Record<string, unknown>) => {
          if (err) {
            this.logger.error('Error getting stats:', err);
            reject(new Error(`Failed to get stats: ${err.message}`));
          } else {
            resolve(stats);
          }
        },
      );
    });
  }
}

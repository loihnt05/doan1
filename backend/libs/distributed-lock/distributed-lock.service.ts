import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * Distributed Lock Service using Redis
 * 
 * Implements distributed locking with:
 * - SET NX PX pattern (atomic set if not exists with TTL)
 * - Safe release with Lua script (check owner before delete)
 * - Lock extension for long operations
 * - Fenced tokens to prevent stale writes
 * 
 * Thread-safety: Redis commands are atomic
 * Network-safety: Use fenced tokens for distributed safety
 */
@Injectable()
export class DistributedLockService implements OnModuleDestroy {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly redis: Redis;

  // Lua script for safe lock release
  // Only delete if the lock value matches (owner check)
  private readonly unlockScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;

  constructor() {
    this.redis = new Redis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });

    this.redis.on('connect', () => {
      this.logger.log('Connected to Redis');
    });

    this.redis.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Acquire a distributed lock
   * 
   * @param key - Lock key (e.g., 'lock:order:123')
   * @param ttlMs - Time to live in milliseconds (default: 5000ms)
   * @param owner - Owner identifier (default: random UUID)
   * @returns Lock token if acquired, null if lock already held
   * 
   * @example
   * const token = await lockService.acquire('lock:order:123');
   * if (!token) {
   *   throw new Error('Resource is locked');
   * }
   * try {
   *   // Critical section
   * } finally {
   *   await lockService.release('lock:order:123', token);
   * }
   */
  async acquire(
    key: string,
    ttlMs: number = 5000,
    owner: string = this.generateOwner(),
  ): Promise<string | null> {
    try {
      // SET key value NX PX ttl
      // NX: Only set if key doesn't exist
      // PX: Set expiry time in milliseconds
      const result = await this.redis.set(key, owner, 'PX', ttlMs, 'NX');

      if (result === 'OK') {
        this.logger.debug(`Lock acquired: ${key} by ${owner}`);
        return owner;
      }

      this.logger.debug(`Lock acquisition failed: ${key} (already held)`);
      return null;
    } catch (error) {
      this.logger.error(`Error acquiring lock ${key}:`, error);
      return null;
    }
  }

  /**
   * Release a distributed lock
   * 
   * @param key - Lock key
   * @param owner - Owner identifier (must match the one used to acquire)
   * @returns true if released, false if not owner or key doesn't exist
   * 
   * Uses Lua script to ensure atomicity:
   * 1. Check if lock value matches owner
   * 2. Delete if match, ignore if not
   * 
   * Prevents releasing someone else's lock!
   */
  async release(key: string, owner: string): Promise<boolean> {
    try {
      const result = await this.redis.eval(
        this.unlockScript,
        1,
        key,
        owner,
      );

      if (result === 1) {
        this.logger.debug(`Lock released: ${key} by ${owner}`);
        return true;
      }

      this.logger.debug(`Lock release failed: ${key} (not owner or expired)`);
      return false;
    } catch (error) {
      this.logger.error(`Error releasing lock ${key}:`, error);
      return false;
    }
  }

  /**
   * Extend lock TTL (for long-running operations)
   * 
   * @param key - Lock key
   * @param owner - Owner identifier (must match)
   * @param ttlMs - New TTL in milliseconds
   * @returns true if extended, false if not owner
   * 
   * Use case: Processing takes longer than expected TTL
   */
  async extend(key: string, owner: string, ttlMs: number): Promise<boolean> {
    try {
      // Check if we own the lock
      const currentOwner = await this.redis.get(key);
      if (currentOwner !== owner) {
        this.logger.debug(`Cannot extend lock ${key}: not owner`);
        return false;
      }

      // Extend TTL
      await this.redis.pexpire(key, ttlMs);
      this.logger.debug(`Lock extended: ${key} for ${ttlMs}ms`);
      return true;
    } catch (error) {
      this.logger.error(`Error extending lock ${key}:`, error);
      return false;
    }
  }

  /**
   * Acquire lock with automatic retry
   * 
   * @param key - Lock key
   * @param options - Retry options
   * @returns Lock token if acquired within retries
   * 
   * @example
   * const token = await lockService.acquireWithRetry('lock:order:123', {
   *   retries: 5,
   *   retryDelay: 100,
   *   ttlMs: 5000,
   * });
   */
  async acquireWithRetry(
    key: string,
    options: {
      retries?: number;
      retryDelay?: number;
      ttlMs?: number;
      owner?: string;
    } = {},
  ): Promise<string | null> {
    const {
      retries = 3,
      retryDelay = 100,
      ttlMs = 5000,
      owner = this.generateOwner(),
    } = options;

    for (let attempt = 0; attempt < retries; attempt++) {
      const token = await this.acquire(key, ttlMs, owner);
      if (token) {
        return token;
      }

      if (attempt < retries - 1) {
        await this.sleep(retryDelay);
      }
    }

    this.logger.warn(`Failed to acquire lock ${key} after ${retries} retries`);
    return null;
  }

  /**
   * Execute function with distributed lock
   * 
   * @param key - Lock key
   * @param fn - Function to execute in critical section
   * @param options - Lock options
   * @returns Result of function execution
   * 
   * @example
   * const result = await lockService.withLock('lock:order:123', async () => {
   *   // Critical section - only one instance executes this at a time
   *   return await processOrder(orderId);
   * });
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options: {
      ttlMs?: number;
      retries?: number;
      retryDelay?: number;
    } = {},
  ): Promise<T> {
    const token = await this.acquireWithRetry(key, options);
    if (!token) {
      throw new Error(`Failed to acquire lock: ${key}`);
    }

    try {
      return await fn();
    } finally {
      await this.release(key, token);
    }
  }

  /**
   * Generate fenced token (monotonically increasing)
   * 
   * Fenced tokens prevent stale writes:
   * - Each lock acquisition gets a new token
   * - Token always increases
   * - Old tokens are rejected
   * 
   * @param resource - Resource identifier
   * @returns Fenced token (integer)
   * 
   * @example
   * const token = await lockService.getFencedToken('order:123');
   * // Later, before writing:
   * if (!await lockService.validateFencedToken('order:123', token)) {
   *   throw new Error('Stale operation - someone else has lock');
   * }
   */
  async getFencedToken(resource: string): Promise<number> {
    const key = `fence:${resource}`;
    const token = await this.redis.incr(key);
    this.logger.debug(`Fenced token generated: ${key} = ${token}`);
    return token;
  }

  /**
   * Validate fenced token
   * 
   * @param resource - Resource identifier
   * @param token - Token to validate
   * @returns true if token is current (highest), false if stale
   * 
   * Use before critical writes to ensure operation is not stale
   */
  async validateFencedToken(resource: string, token: number): Promise<boolean> {
    const key = `fence:${resource}`;
    const currentToken = await this.redis.get(key);
    const current = parseInt(currentToken || '0');

    const isValid = token >= current;
    if (!isValid) {
      this.logger.warn(
        `Stale fenced token rejected: ${key} (got ${token}, current ${current})`,
      );
    }

    return isValid;
  }

  /**
   * Get current fenced token without incrementing
   * 
   * @param resource - Resource identifier
   * @returns Current token value
   */
  async getCurrentFencedToken(resource: string): Promise<number> {
    const key = `fence:${resource}`;
    const token = await this.redis.get(key);
    return parseInt(token || '0');
  }

  /**
   * Check if lock is held
   * 
   * @param key - Lock key
   * @returns true if lock exists, false otherwise
   */
  async isLocked(key: string): Promise<boolean> {
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  /**
   * Get lock owner
   * 
   * @param key - Lock key
   * @returns Owner identifier or null if not locked
   */
  async getOwner(key: string): Promise<string | null> {
    return await this.redis.get(key);
  }

  /**
   * Get remaining TTL
   * 
   * @param key - Lock key
   * @returns Remaining TTL in milliseconds, -1 if key doesn't exist, -2 if no TTL
   */
  async getTTL(key: string): Promise<number> {
    return await this.redis.pttl(key);
  }

  private generateOwner(): string {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

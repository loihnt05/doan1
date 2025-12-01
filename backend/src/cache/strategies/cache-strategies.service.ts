import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

export interface Product {
  id: number;
  name: string;
  price: number;
  stock: number;
  updatedAt: Date;
}

export interface WriteOperation {
  id: number;
  data: Partial<Product>;
  timestamp: number;
}

@Injectable()
export class CacheStrategiesService {
  private readonly logger = new Logger(CacheStrategiesService.name);

  // Simulated database
  private database: Map<number, Product> = new Map();

  // Write-behind queue
  private writeQueue: WriteOperation[] = [];
  private writeQueueInterval: NodeJS.Timeout | null = null;

  // Distributed locks (in-memory for demo)
  private locks: Map<string, number> = new Map();

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {
    // Initialize with some sample data
    this.initializeDatabase();
    // Start write-behind processor
    this.startWriteBehindProcessor();
  }

  private initializeDatabase() {
    const sampleProducts: Product[] = [
      {
        id: 1,
        name: 'Laptop',
        price: 999.99,
        stock: 10,
        updatedAt: new Date(),
      },
      { id: 2, name: 'Mouse', price: 29.99, stock: 50, updatedAt: new Date() },
      {
        id: 3,
        name: 'Keyboard',
        price: 79.99,
        stock: 30,
        updatedAt: new Date(),
      },
      {
        id: 4,
        name: 'Monitor',
        price: 299.99,
        stock: 15,
        updatedAt: new Date(),
      },
      {
        id: 5,
        name: 'Headphones',
        price: 149.99,
        stock: 25,
        updatedAt: new Date(),
      },
    ];

    sampleProducts.forEach((product) => {
      this.database.set(product.id, product);
    });
  }

  /**
   * CACHE ASIDE (Lazy Loading)
   * Application is responsible for reading and writing from storage
   * Cache only interacts with the application
   *
   * Flow:
   * 1. Check cache first
   * 2. If cache miss, read from DB
   * 3. Write to cache
   * 4. Return data
   */
  async cacheAside(
    productId: number,
  ): Promise<{ product: Product | null; source: string; latency: number }> {
    const startTime = Date.now();
    const cacheKey = `cache-aside:product:${productId}`;

    // Step 1: Try to get from cache
    this.logger.log(`[Cache Aside] Checking cache for product ${productId}`);
    const cached = await this.cacheManager.get<Product>(cacheKey);

    if (cached) {
      const latency = Date.now() - startTime;
      this.logger.log(`[Cache Aside] Cache HIT for product ${productId}`);
      return { product: cached, source: 'cache', latency };
    }

    // Step 2: Cache miss - read from database
    this.logger.log(
      `[Cache Aside] Cache MISS for product ${productId} - reading from DB`,
    );
    await this.simulateDbLatency();
    const product = this.database.get(productId) || null;

    if (product) {
      // Step 3: Write to cache
      this.logger.log(`[Cache Aside] Writing product ${productId} to cache`);
      await this.cacheManager.set(cacheKey, product, 60000); // 60 seconds TTL
    }

    const latency = Date.now() - startTime;
    return { product, source: 'database', latency };
  }

  /**
   * Updates product using Cache Aside pattern
   * On write: Update DB first, then invalidate cache
   */
  async cacheAsideUpdate(
    productId: number,
    updates: Partial<Product>,
  ): Promise<{ product: Product | null; message: string }> {
    const cacheKey = `cache-aside:product:${productId}`;

    // Step 1: Update database
    this.logger.log(`[Cache Aside] Updating product ${productId} in DB`);
    await this.simulateDbLatency();
    const product = this.database.get(productId);

    if (!product) {
      return { product: null, message: 'Product not found' };
    }

    const updatedProduct = { ...product, ...updates, updatedAt: new Date() };
    this.database.set(productId, updatedProduct);

    // Step 2: Invalidate cache (remove stale data)
    this.logger.log(
      `[Cache Aside] Invalidating cache for product ${productId}`,
    );
    await this.cacheManager.del(cacheKey);

    return {
      product: updatedProduct,
      message: 'Product updated, cache invalidated',
    };
  }

  /**
   * WRITE THROUGH
   * Application uses cache as main data store
   * Cache is responsible for writing to DB
   *
   * Flow:
   * 1. Write to cache
   * 2. Cache synchronously writes to DB
   * 3. Return success
   */
  async writeThrough(
    productId: number,
    updates: Partial<Product>,
  ): Promise<{ product: Product | null; message: string; latency: number }> {
    const startTime = Date.now();
    const cacheKey = `write-through:product:${productId}`;

    const product = this.database.get(productId);
    if (!product) {
      return { product: null, message: 'Product not found', latency: 0 };
    }

    const updatedProduct = { ...product, ...updates, updatedAt: new Date() };

    // Step 1: Write to cache
    this.logger.log(`[Write Through] Writing product ${productId} to cache`);
    await this.cacheManager.set(cacheKey, updatedProduct, 300000); // 5 min TTL

    // Step 2: Synchronously write to database (cache writes through to DB)
    this.logger.log(
      `[Write Through] Synchronously writing product ${productId} to DB`,
    );
    await this.simulateDbLatency();
    this.database.set(productId, updatedProduct);

    const latency = Date.now() - startTime;
    this.logger.log(`[Write Through] Write completed in ${latency}ms`);

    return {
      product: updatedProduct,
      message: 'Product updated via write-through',
      latency,
    };
  }

  /**
   * Read using Write Through pattern
   * Since writes go through cache, reads are typically fast
   */
  async writeThroughRead(
    productId: number,
  ): Promise<{ product: Product | null; source: string; latency: number }> {
    const startTime = Date.now();
    const cacheKey = `write-through:product:${productId}`;

    // Try cache first
    const cached = await this.cacheManager.get<Product>(cacheKey);
    if (cached) {
      const latency = Date.now() - startTime;
      this.logger.log(
        `[Write Through Read] Cache HIT for product ${productId}`,
      );
      return { product: cached, source: 'cache', latency };
    }

    // On miss, read from DB and populate cache
    this.logger.log(`[Write Through Read] Cache MISS - reading from DB`);
    await this.simulateDbLatency();
    const product = this.database.get(productId) || null;

    if (product) {
      await this.cacheManager.set(cacheKey, product, 300000);
    }

    const latency = Date.now() - startTime;
    return { product, source: 'database', latency };
  }

  /**
   * WRITE BEHIND (Write Back)
   * Writes to cache immediately and asynchronously writes to DB
   *
   * Flow:
   * 1. Write to cache immediately
   * 2. Add to write queue
   * 3. Return success (fast)
   * 4. Background process writes to DB
   */
  async writeBehind(
    productId: number,
    updates: Partial<Product>,
  ): Promise<{ product: Product | null; message: string; latency: number }> {
    const startTime = Date.now();
    const cacheKey = `write-behind:product:${productId}`;

    const product = this.database.get(productId);
    if (!product) {
      return { product: null, message: 'Product not found', latency: 0 };
    }

    const updatedProduct = { ...product, ...updates, updatedAt: new Date() };

    // Step 1: Write to cache immediately (fast)
    this.logger.log(`[Write Behind] Writing product ${productId} to cache`);
    await this.cacheManager.set(cacheKey, updatedProduct, 300000);

    // Step 2: Add to write queue for async DB update
    this.logger.log(
      `[Write Behind] Adding product ${productId} to write queue`,
    );
    this.writeQueue.push({
      id: productId,
      data: updatedProduct,
      timestamp: Date.now(),
    });

    const latency = Date.now() - startTime;
    this.logger.log(
      `[Write Behind] Write completed in ${latency}ms (DB write pending)`,
    );

    return {
      product: updatedProduct,
      message: `Product updated in cache, DB write queued (queue size: ${this.writeQueue.length})`,
      latency,
    };
  }

  /**
   * Background processor for write-behind queue
   */
  private startWriteBehindProcessor() {
    this.writeQueueInterval = setInterval(() => {
      void (async () => {
        if (this.writeQueue.length === 0) return;

        this.logger.log(
          `[Write Behind Processor] Processing ${this.writeQueue.length} queued writes`,
        );

        const operations = [...this.writeQueue];
        this.writeQueue = [];

        for (const op of operations) {
          try {
            await this.simulateDbLatency();
            this.database.set(op.id, op.data as Product);
            this.logger.log(
              `[Write Behind Processor] Wrote product ${op.id} to DB`,
            );
          } catch (error) {
            this.logger.error(
              `[Write Behind Processor] Failed to write product ${op.id}`,
              error,
            );
            // In production, you'd implement retry logic here
          }
        }
      })();
    }, 5000); // Process queue every 5 seconds
  }

  /**
   * READ THROUGH
   * Cache sits between application and database
   * Cache is responsible for loading data from DB on cache miss
   *
   * Flow:
   * 1. Application reads from cache
   * 2. On cache miss, cache loads from DB
   * 3. Cache stores the data
   * 4. Cache returns data to application
   */
  async readThrough(
    productId: number,
  ): Promise<{ product: Product | null; source: string; latency: number }> {
    const startTime = Date.now();
    const cacheKey = `read-through:product:${productId}`;

    // Check cache
    this.logger.log(`[Read Through] Checking cache for product ${productId}`);
    const cached = await this.cacheManager.get<Product>(cacheKey);

    if (cached) {
      const latency = Date.now() - startTime;
      this.logger.log(`[Read Through] Cache HIT for product ${productId}`);
      return { product: cached, source: 'cache', latency };
    }

    // Cache miss - cache is responsible for loading from DB
    this.logger.log(
      `[Read Through] Cache MISS - cache loading from DB for product ${productId}`,
    );
    await this.simulateDbLatency();
    const dbProduct = this.database.get(productId);
    const product = dbProduct ?? null;

    if (product) {
      // Cache stores the data automatically
      this.logger.log(`[Read Through] Cache storing product ${productId}`);
      await this.cacheManager.set(cacheKey, product, 300000);
    }

    const latency = Date.now() - startTime;
    return { product, source: 'database (via cache)', latency };
  }

  /**
   * DISTRIBUTED LOCK + CACHE
   * Prevents cache stampede using distributed locks
   * Only one request loads data from DB on cache miss
   *
   * Flow:
   * 1. Check cache
   * 2. On miss, try to acquire lock
   * 3. If lock acquired: load from DB, update cache, release lock
   * 4. If lock not acquired: wait and retry reading from cache
   */
  async distributedLockCache(productId: number): Promise<{
    product: Product | null;
    source: string;
    latency: number;
    lockAcquired: boolean;
    retries: number;
  }> {
    const startTime = Date.now();
    const cacheKey = `lock-cache:product:${productId}`;
    const lockKey = `lock:product:${productId}`;
    let retries = 0;
    let lockAcquired = false;

    // Step 1: Check cache
    this.logger.log(
      `[Distributed Lock] Checking cache for product ${productId}`,
    );
    const cachedProduct = await this.cacheManager.get<Product>(cacheKey);

    if (cachedProduct) {
      const latency = Date.now() - startTime;
      this.logger.log(`[Distributed Lock] Cache HIT for product ${productId}`);
      return {
        product: cachedProduct,
        source: 'cache',
        latency,
        lockAcquired: false,
        retries: 0,
      };
    }

    // Step 2: Try to acquire distributed lock
    this.logger.log(
      `[Distributed Lock] Cache MISS - attempting to acquire lock for product ${productId}`,
    );
    const lockAcquiredResult = this.acquireLock(lockKey, 10000); // 10 second lock

    if (lockAcquiredResult) {
      lockAcquired = true;
      this.logger.log(
        `[Distributed Lock] Lock ACQUIRED for product ${productId} - loading from DB`,
      );

      try {
        // Step 3: Load from database
        await this.simulateDbLatency();
        const dbProduct = this.database.get(productId);
        const product = dbProduct ?? null;

        if (product) {
          // Step 4: Update cache
          this.logger.log(
            `[Distributed Lock] Updating cache for product ${productId}`,
          );
          await this.cacheManager.set(cacheKey, product, 300000);
        }

        // Step 5: Release lock
        this.releaseLock(lockKey);
        this.logger.log(
          `[Distributed Lock] Lock RELEASED for product ${productId}`,
        );

        const latency = Date.now() - startTime;
        return {
          product,
          source: 'database (lock holder)',
          latency,
          lockAcquired,
          retries,
        };
      } catch (error) {
        this.releaseLock(lockKey);
        throw error;
      }
    } else {
      // Lock not acquired - another request is loading data
      this.logger.log(
        `[Distributed Lock] Lock NOT acquired for product ${productId} - waiting for cache update`,
      );

      // Wait and retry reading from cache
      const maxRetries = 5;
      while (retries < maxRetries) {
        await this.sleep(500); // Wait 500ms
        retries++;

        const cachedAfterWait = await this.cacheManager.get<Product>(cacheKey);
        if (cachedAfterWait) {
          const latency = Date.now() - startTime;
          this.logger.log(
            `[Distributed Lock] Cache populated by lock holder after ${retries} retries`,
          );
          return {
            product: cachedAfterWait,
            source: 'cache (after wait)',
            latency,
            lockAcquired: false,
            retries,
          };
        }
      }

      // Fallback: read from DB directly if cache still not populated
      this.logger.warn(
        `[Distributed Lock] Cache still empty after ${maxRetries} retries - reading from DB`,
      );
      await this.simulateDbLatency();
      const dbProduct = this.database.get(productId);
      const product = dbProduct ?? null;

      const latency = Date.now() - startTime;
      return {
        product,
        source: 'database (fallback)',
        latency,
        lockAcquired: false,
        retries,
      };
    }
  }

  /**
   * Acquire distributed lock using in-memory locks
   * In production, use Redis or another distributed lock service
   */
  private acquireLock(lockKey: string, ttlMs: number): boolean {
    try {
      const now = Date.now();
      const existingLock = this.locks.get(lockKey);

      // Check if lock exists and hasn't expired
      if (existingLock && existingLock > now) {
        return false; // Lock already held
      }

      // Acquire lock
      this.locks.set(lockKey, now + ttlMs);
      return true;
    } catch (error) {
      this.logger.error(`Failed to acquire lock ${lockKey}`, error);
      return false;
    }
  }

  /**
   * Release distributed lock
   */
  private releaseLock(lockKey: string): void {
    try {
      this.locks.delete(lockKey);
    } catch (error) {
      this.logger.error(`Failed to release lock ${lockKey}`, error);
    }
  }

  /**
   * Simulate cache stampede scenario
   * Multiple concurrent requests for the same resource
   */
  async simulateCacheStampede(productId: number): Promise<{
    totalRequests: number;
    dbReads: number;
    cacheHits: number;
    avgLatency: number;
  }> {
    const cacheKey = `stampede:product:${productId}`;

    // Clear cache to simulate cold start
    await this.cacheManager.del(cacheKey);

    this.logger.log(
      `[Cache Stampede] Simulating 10 concurrent requests for product ${productId}`,
    );

    // Without lock - cache stampede
    const requests = Array(10)
      .fill(null)
      .map(async (_, index) => {
        const start = Date.now();

        const cachedProduct = await this.cacheManager.get<Product>(cacheKey);
        let source = 'cache';
        let product: Product | null = null;

        if (!cachedProduct) {
          this.logger.log(
            `[Cache Stampede] Request ${index + 1} - Cache MISS, reading from DB`,
          );
          await this.simulateDbLatency();
          const dbProduct = this.database.get(productId);
          product = dbProduct ?? null;
          source = 'database';

          if (product) {
            await this.cacheManager.set(cacheKey, product, 60000);
          }
        } else {
          product = cachedProduct;
          this.logger.log(`[Cache Stampede] Request ${index + 1} - Cache HIT`);
        }

        return { latency: Date.now() - start, source };
      });

    const results = await Promise.all(requests);
    const dbReads = results.filter((r) => r.source === 'database').length;
    const cacheHits = results.filter((r) => r.source === 'cache').length;
    const avgLatency =
      results.reduce((sum, r) => sum + r.latency, 0) / results.length;

    this.logger.log(
      `[Cache Stampede] Results: ${dbReads} DB reads, ${cacheHits} cache hits, avg latency: ${avgLatency.toFixed(2)}ms`,
    );

    return {
      totalRequests: results.length,
      dbReads,
      cacheHits,
      avgLatency,
    };
  }

  /**
   * Get write-behind queue status
   */
  getWriteBehindQueueStatus(): {
    queueSize: number;
    pendingWrites: WriteOperation[];
  } {
    return {
      queueSize: this.writeQueue.length,
      pendingWrites: this.writeQueue,
    };
  }

  /**
   * Clear all caches for demo purposes
   * Note: Cache manager doesn't support pattern-based deletion,
   * so we track keys manually or use cache.del() for known keys
   */
  async clearAllCaches(): Promise<{ message: string }> {
    // Clear known cache keys
    const patterns = [
      'cache-aside:',
      'write-through:',
      'write-behind:',
      'read-through:',
      'lock-cache:',
      'stampede:',
    ];

    // Clear product caches for IDs 1-10 (our sample data range)
    for (const pattern of patterns) {
      for (let i = 1; i <= 10; i++) {
        try {
          await this.cacheManager.del(`${pattern}product:${i}`);
        } catch {
          // Ignore errors for non-existent keys
        }
      }
    }

    // Also clear in-memory locks
    this.locks.clear();

    this.logger.log('All strategy caches cleared');
    return { message: 'All strategy caches cleared' };
  }

  /**
   * Reset database to initial state
   */
  resetDatabase(): { message: string } {
    this.database.clear();
    this.initializeDatabase();
    return { message: 'Database reset to initial state' };
  }

  // Helper methods
  private async simulateDbLatency(): Promise<void> {
    // Simulate 50-150ms database latency
    const latency = 50 + Math.random() * 100;
    await this.sleep(latency);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  onModuleDestroy() {
    if (this.writeQueueInterval) {
      clearInterval(this.writeQueueInterval);
    }
  }
}

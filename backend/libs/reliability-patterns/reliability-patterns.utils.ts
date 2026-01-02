import { Logger } from '@nestjs/common';

const logger = new Logger('ReliabilityPatterns');

/**
 * Timeout wrapper - race against time limit
 * 
 * @param promise - Promise to wrap
 * @param ms - Timeout in milliseconds
 * @param errorMessage - Custom error message
 * @returns Promise that rejects if timeout exceeded
 * 
 * @example
 * const result = await withTimeout(fetchData(), 1000, 'Data fetch timeout');
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage = 'Operation timeout',
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), ms),
    ),
  ]);
}

/**
 * Retry with exponential backoff
 * 
 * @param fn - Function to retry
 * @param options - Retry configuration
 * @returns Result of successful execution
 * @throws Last error if all retries exhausted
 * 
 * @example
 * const result = await retry(
 *   () => fetchDataFromAPI(),
 *   { retries: 3, backoff: 500, exponential: true }
 * );
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    backoff?: number;
    exponential?: boolean;
    onRetry?: (attempt: number, error: Error) => void;
  } = {},
): Promise<T> {
  const {
    retries = 3,
    backoff = 1000,
    exponential = true,
    onRetry,
  } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === retries) {
        throw lastError;
      }

      const delay = exponential ? backoff * Math.pow(2, attempt - 1) : backoff;

      logger.warn(
        `Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms...`,
      );

      if (onRetry) {
        onRetry(attempt, lastError);
      }

      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Retry with jitter (randomized backoff)
 * Prevents thundering herd problem
 * 
 * @param fn - Function to retry
 * @param options - Retry configuration with jitter
 * @returns Result of successful execution
 * 
 * @example
 * const result = await retryWithJitter(
 *   () => callExternalAPI(),
 *   { retries: 5, baseDelay: 1000, maxDelay: 10000 }
 * );
 */
export async function retryWithJitter<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    baseDelay?: number;
    maxDelay?: number;
    onRetry?: (attempt: number, error: Error, delay: number) => void;
  } = {},
): Promise<T> {
  const { retries = 3, baseDelay = 1000, maxDelay = 30000, onRetry } = options;

  let lastError: Error;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (attempt === retries) {
        throw lastError;
      }

      // Exponential backoff with jitter
      const exponentialDelay = Math.min(
        baseDelay * Math.pow(2, attempt - 1),
        maxDelay,
      );
      const jitter = Math.random() * exponentialDelay;
      const delay = Math.floor(exponentialDelay + jitter);

      logger.warn(
        `Attempt ${attempt} failed: ${lastError.message}. Retrying in ${delay}ms... (with jitter)`,
      );

      if (onRetry) {
        onRetry(attempt, lastError, delay);
      }

      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Bulkhead pattern - limit concurrent operations
 * Prevents resource exhaustion
 * 
 * @example
 * const bulkhead = new Bulkhead(5); // Max 5 concurrent
 * await bulkhead.execute(() => processItem(item));
 */
export class Bulkhead {
  private activeCount = 0;
  private queue: Array<() => void> = [];

  constructor(private readonly maxConcurrent: number) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    while (this.activeCount >= this.maxConcurrent) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }

    this.activeCount++;

    try {
      return await fn();
    } finally {
      this.activeCount--;
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }

  getActiveCount(): number {
    return this.activeCount;
  }

  getQueueLength(): number {
    return this.queue.length;
  }
}

/**
 * Rate limiter using token bucket algorithm
 * 
 * @example
 * const limiter = new RateLimiter(10, 1000); // 10 ops per second
 * await limiter.acquire();
 * await processRequest();
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillInterval: number,
  ) {
    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  async acquire(tokens = 1): Promise<void> {
    while (true) {
      this.refill();

      if (this.tokens >= tokens) {
        this.tokens -= tokens;
        return;
      }

      // Wait for next refill
      const waitTime = this.refillInterval - (Date.now() - this.lastRefill);
      await sleep(Math.max(waitTime, 10));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = Math.floor(elapsed / this.refillInterval) * this.capacity;

    if (tokensToAdd > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }
}

/**
 * Fallback pattern - provide default value on failure
 * 
 * @param primary - Primary function to execute
 * @param fallback - Fallback value or function
 * @returns Primary result or fallback
 * 
 * @example
 * const result = await withFallback(
 *   () => fetchFromCache(),
 *   () => fetchFromDatabase()
 * );
 */
export async function withFallback<T>(
  primary: () => Promise<T>,
  fallback: T | (() => Promise<T>),
): Promise<T> {
  try {
    return await primary();
  } catch (error) {
    logger.warn(`Primary operation failed, using fallback: ${error.message}`);
    return typeof fallback === 'function' ? await (fallback as () => Promise<T>)() : fallback;
  }
}

/**
 * Debounce - delay execution until quiet period
 * 
 * @param fn - Function to debounce
 * @param delay - Quiet period in milliseconds
 * @returns Debounced function
 * 
 * @example
 * const debouncedSearch = debounce(search, 300);
 * debouncedSearch('query'); // Only executes after 300ms of no calls
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Throttle - limit execution rate
 * 
 * @param fn - Function to throttle
 * @param interval - Minimum interval between executions
 * @returns Throttled function
 * 
 * @example
 * const throttledUpdate = throttle(updateMetrics, 1000);
 * throttledUpdate(); // Only executes once per second
 */
export function throttle<T extends (...args: any[]) => any>(
  fn: T,
  interval: number,
): (...args: Parameters<T>) => void {
  let lastCall = 0;

  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= interval) {
      lastCall = now;
      fn(...args);
    }
  };
}

/**
 * Cache with TTL
 * 
 * @example
 * const cache = new Cache<string>(5000); // 5 second TTL
 * cache.set('key', 'value');
 * const value = cache.get('key'); // Returns 'value' if not expired
 */
export class Cache<T> {
  private store = new Map<string, { value: T; expires: number }>();

  constructor(private readonly ttlMs: number) {}

  set(key: string, value: T): void {
    this.store.set(key, {
      value,
      expires: Date.now() + this.ttlMs,
    });
  }

  get(key: string): T | undefined {
    const item = this.store.get(key);
    if (!item) {
      return undefined;
    }

    if (Date.now() > item.expires) {
      this.store.delete(key);
      return undefined;
    }

    return item.value;
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    // Clean expired entries
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (now > item.expires) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

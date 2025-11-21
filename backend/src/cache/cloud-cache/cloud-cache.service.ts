import { Injectable, Logger } from '@nestjs/common';

interface CachedResponse {
  body: string;
  headers: Record<string, string>;
  status: number;
  cachedAt: number;
  maxAge: number;
}

@Injectable()
export class CloudCacheService {
  private readonly logger = new Logger(CloudCacheService.name);
  private readonly cache = new Map<string, CachedResponse>();
  private readonly defaultMaxAge = 10; // 10 seconds default, similar to Cloudflare examples

  /**
   * Generate a cache key from a URL
   * Similar to Cloudflare's cache key generation
   */
  private generateCacheKey(url: string): string {
    return url;
  }

  /**
   * Check if cached response is still valid
   */
  private isCacheValid(cached: CachedResponse): boolean {
    const now = Date.now();
    const age = (now - cached.cachedAt) / 1000; // age in seconds
    return age < cached.maxAge;
  }

  /**
   * Parse Cache-Control header to extract max-age
   */
  private parseMaxAge(cacheControl?: string): number {
    if (!cacheControl) return this.defaultMaxAge;

    const maxAgeMatch = cacheControl.match(/s-maxage=(\d+)/);
    if (maxAgeMatch) return parseInt(maxAgeMatch[1], 10);

    const maxAgeAltMatch = cacheControl.match(/max-age=(\d+)/);
    if (maxAgeAltMatch) return parseInt(maxAgeAltMatch[1], 10);

    return this.defaultMaxAge;
  }

  /**
   * Get cached response if exists and valid
   * Similar to Cloudflare's cache.match()
   */
  match(url: string): CachedResponse | null {
    const cacheKey = this.generateCacheKey(url);
    const cached = this.cache.get(cacheKey);

    if (!cached) {
      this.logger.log(`Cache MISS for: ${url}`);
      return null;
    }

    if (!this.isCacheValid(cached)) {
      this.logger.log(`Cache EXPIRED for: ${url}`);
      this.cache.delete(cacheKey);
      return null;
    }

    this.logger.log(`Cache HIT for: ${url}`);
    return cached;
  }

  /**
   * Store response in cache
   * Similar to Cloudflare's cache.put()
   */
  put(
    url: string,
    data: any,
    options?: { headers?: Record<string, string> },
  ): void {
    const cacheKey = this.generateCacheKey(url);
    const headers = options?.headers || {};
    const maxAge = this.parseMaxAge(headers['cache-control']);

    const cachedResponse: CachedResponse = {
      body: JSON.stringify(data),
      headers,
      status: 200,
      cachedAt: Date.now(),
      maxAge,
    };

    this.cache.set(cacheKey, cachedResponse);
    this.logger.log(`Cached response for: ${url} (TTL: ${maxAge}s)`);
  }

  /**
   * Delete cached response
   * Similar to Cloudflare's cache.delete()
   */
  delete(url: string): boolean {
    const cacheKey = this.generateCacheKey(url);
    const deleted = this.cache.delete(cacheKey);

    if (deleted) {
      this.logger.log(`Deleted cache for: ${url}`);
    }

    return deleted;
  }

  /**
   * Clear all cached responses
   */
  clear(): void {
    this.cache.clear();
    this.logger.log('Cleared all cache');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    validEntries: number;
    expiredEntries: number;
  } {
    let validEntries = 0;
    let expiredEntries = 0;

    for (const cached of this.cache.values()) {
      if (this.isCacheValid(cached)) {
        validEntries++;
      } else {
        expiredEntries++;
      }
    }

    return {
      totalEntries: this.cache.size,
      validEntries,
      expiredEntries,
    };
  }

  /**
   * Clean up expired cache entries
   * Can be called periodically
   */
  cleanupExpired(): number {
    let cleaned = 0;

    for (const [key, cached] of this.cache.entries()) {
      if (!this.isCacheValid(cached)) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} expired cache entries`);
    }

    return cleaned;
  }
}

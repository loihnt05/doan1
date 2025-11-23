import { Injectable, Logger } from '@nestjs/common';
import { CloudCacheService } from './cloud-cache.service';

/**
 * Example service demonstrating Cloudflare-style caching patterns
 */
@Injectable()
export class CloudCacheExampleService {
  private readonly logger = new Logger(CloudCacheExampleService.name);

  constructor(private readonly cloudCache: CloudCacheService) {}

  /**
   * Example 1: Basic API caching pattern
   * Similar to Cloudflare Workers cache.match() and cache.put()
   */
  async fetchWithCache(url: string, ttl = 60): Promise<any> {
    // Try to get from cache
    const cached = this.cloudCache.match(url);

    if (cached) {
      this.logger.log(`Cache HIT for: ${url}`);
      return {
        source: 'cache',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: JSON.parse(cached.body),
        cachedAt: new Date(cached.cachedAt),
        age: Math.floor((Date.now() - cached.cachedAt) / 1000),
      };
    }

    // Fetch from origin
    this.logger.log(`Cache MISS for: ${url}. Fetching from origin...`);
    const response = await fetch(url);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await response.json();

    // Store in cache
    this.cloudCache.put(url, data, {
      headers: { 'cache-control': `s-maxage=${ttl}` },
    });

    return {
      source: 'origin',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data,
    };
  }

  /**
   * Example 2: Caching with different TTLs based on content type
   * Inspired by Cloudflare's cacheTtlByStatus
   */
  async fetchWithContentBasedTtl(url: string): Promise<any> {
    const cached = this.cloudCache.match(url);

    if (cached) {
      return JSON.parse(cached.body);
    }

    const response = await fetch(url);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await response.json();

    // Determine TTL based on URL pattern
    let ttl = 60; // default 1 minute

    if (url.includes('/static/')) {
      ttl = 3600; // 1 hour for static content
    } else if (url.includes('/api/')) {
      ttl = 30; // 30 seconds for API responses
    } else if (url.includes('/config/')) {
      ttl = 300; // 5 minutes for config
    }

    this.cloudCache.put(url, data, {
      headers: { 'cache-control': `s-maxage=${ttl}` },
    });

    return data;
  }

  /**
   * Example 3: Cache with custom key generation
   * Similar to Cloudflare's cacheKey option
   */
  async fetchWithCustomKey(url: string, userId?: string): Promise<any> {
    // Create custom cache key with user context
    const cacheKey = userId ? `${url}?userId=${userId}` : url;

    const cached = this.cloudCache.match(cacheKey);

    if (cached) {
      return JSON.parse(cached.body);
    }

    // Fetch data (in real scenario, this would include user-specific data)
    const response = await fetch(url);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await response.json();

    this.cloudCache.put(cacheKey, data, {
      headers: { 'cache-control': 's-maxage=120' },
    });

    return data;
  }

  /**
   * Example 4: Preload/warm cache for common requests
   */
  async warmUpCache(urls: string[], ttl = 3600): Promise<void> {
    this.logger.log(`Warming up cache for ${urls.length} URLs...`);

    const promises = urls.map(async (url) => {
      try {
        const response = await fetch(url);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const data = await response.json();

        this.cloudCache.put(url, data, {
          headers: { 'cache-control': `s-maxage=${ttl}` },
        });

        this.logger.log(`Cached: ${url}`);
      } catch (error) {
        this.logger.error(`Failed to cache ${url}:`, error);
      }
    });

    await Promise.all(promises);
    this.logger.log('Cache warm-up complete');
  }

  /**
   * Example 5: Invalidate cache pattern
   * When data is updated, remove from cache
   */
  updateAndInvalidateCache(url: string, newData: any): void {
    // In real scenario, you would update the data source here
    // For demo, we'll just invalidate the cache

    this.cloudCache.delete(url);
    this.logger.log(`Cache invalidated for: ${url}`);

    // Optionally, immediately cache the new data
    this.cloudCache.put(url, newData, {
      headers: { 'cache-control': 's-maxage=60' },
    });
  }

  /**
   * Example 6: Batch operations
   */
  async fetchMultipleWithCache(urls: string[]): Promise<any[]> {
    const results = await Promise.all(
      urls.map((url) => this.fetchWithCache(url)),
    );

    return results;
  }

  /**
   * Example 7: Cache monitoring
   */
  getCacheHealth(): {
    stats: any;
    recommendations: string[];
  } {
    const stats = this.cloudCache.getStats();
    const recommendations: string[] = [];

    // Analyze cache effectiveness
    if (stats.totalEntries === 0) {
      recommendations.push('Cache is empty. Consider pre-warming cache.');
    }

    if (stats.expiredEntries > stats.validEntries) {
      recommendations.push(
        'Many expired entries detected. Run cleanup or increase TTLs.',
      );
    }

    const hitRate =
      stats.totalEntries > 0
        ? (stats.validEntries / stats.totalEntries) * 100
        : 0;

    if (hitRate < 50) {
      recommendations.push(
        `Low cache hit rate (${hitRate.toFixed(1)}%). Consider increasing TTLs.`,
      );
    }

    return {
      stats: {
        ...stats,
        hitRate: `${hitRate.toFixed(1)}%`,
      },
      recommendations,
    };
  }
}

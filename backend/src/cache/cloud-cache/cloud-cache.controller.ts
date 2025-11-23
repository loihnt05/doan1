import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { CloudCacheService } from './cloud-cache.service';

@Controller('cloud-cache')
export class CloudCacheController {
  constructor(private readonly cloudCacheService: CloudCacheService) {}

  /**
   * Get cached data for a specific URL
   * Example: GET /cloud-cache/match?url=https://api.example.com/data
   */
  @Get('match')
  getCachedData(@Query('url') url: string) {
    if (!url) {
      return {
        error: 'URL parameter is required',
      };
    }

    const cached = this.cloudCacheService.match(url);

    if (!cached) {
      return {
        cached: false,
        message: 'Cache miss',
      };
    }

    return {
      cached: true,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data: JSON.parse(cached.body),
      headers: cached.headers,
      cachedAt: new Date(cached.cachedAt).toISOString(),
      age: Math.floor((Date.now() - cached.cachedAt) / 1000),
      maxAge: cached.maxAge,
    };
  }

  /**
   * Store data in cache
   * Example: POST /cloud-cache/put
   * Body: { "url": "https://api.example.com/data", "data": {...}, "ttl": 60 }
   */
  @Post('put')
  @HttpCode(HttpStatus.CREATED)
  putCachedData(
    @Body()
    body: {
      url: string;
      data: any;
      ttl?: number;
    },
  ) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const { url, data, ttl } = body;

    if (!url || !data) {
      return {
        error: 'URL and data are required',
      };
    }

    const headers: Record<string, string> = {};
    if (ttl) {
      headers['cache-control'] = `s-maxage=${ttl}`;
    }

    this.cloudCacheService.put(url, data, { headers });

    return {
      success: true,
      message: 'Data cached successfully',
      url,
      ttl: ttl || 10,
    };
  }

  /**
   * Delete cached data for a specific URL
   * Example: DELETE /cloud-cache/delete?url=https://api.example.com/data
   */
  @Delete('delete')
  deleteCachedData(@Query('url') url: string) {
    if (!url) {
      return {
        error: 'URL parameter is required',
      };
    }

    const deleted = this.cloudCacheService.delete(url);

    return {
      success: deleted,
      message: deleted ? 'Cache deleted successfully' : 'Cache not found',
    };
  }

  /**
   * Clear all cache
   * Example: DELETE /cloud-cache/clear
   */
  @Delete('clear')
  clearCache() {
    this.cloudCacheService.clear();

    return {
      success: true,
      message: 'All cache cleared',
    };
  }

  /**
   * Get cache statistics
   * Example: GET /cloud-cache/stats
   */
  @Get('stats')
  getStats() {
    return this.cloudCacheService.getStats();
  }

  /**
   * Clean up expired cache entries
   * Example: POST /cloud-cache/cleanup
   */
  @Post('cleanup')
  @HttpCode(HttpStatus.OK)
  cleanupExpired() {
    const cleaned = this.cloudCacheService.cleanupExpired();
    return {
      success: true,
      cleaned,
      message: `Cleaned up ${cleaned} expired entries`,
    };
  }

  /**
   * Example endpoint demonstrating cache usage
   * Similar to Cloudflare Workers cache pattern
   * Example: GET /cloud-cache/example/users
   */
  @Get('example/:resource')
  async exampleCachedEndpoint(@Param('resource') resource: string) {
    const url = `https://jsonplaceholder.typicode.com/${resource}`;

    // Try to get from cache first
    const cached = this.cloudCacheService.match(url);

    if (cached) {
      return {
        source: 'cache',
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        data: JSON.parse(cached.body),
        cachedAt: new Date(cached.cachedAt).toISOString(),
        age: Math.floor((Date.now() - cached.cachedAt) / 1000),
      };
    }

    // Fetch from origin if not in cache
    const response = await fetch(url);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await response.json();

    // Store in cache with 30 second TTL
    this.cloudCacheService.put(url, data, {
      headers: { 'cache-control': 's-maxage=30' },
    });

    return {
      source: 'origin',
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      data,
      message: 'Data fetched and cached',
    };
  }
}

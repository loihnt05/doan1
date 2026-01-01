import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Inject,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { CACHEABLE_KEY } from '../decorators/cacheable.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const metadata = this.reflector.get<{
      cacheKeyPrefix: string;
      options?: { key?: string; ttl?: number };
    }>(CACHEABLE_KEY, context.getHandler());

    if (!metadata) {
      return next.handle();
    }

    const { cacheKeyPrefix, options } = metadata;
    let cacheKey = cacheKeyPrefix;

    // Build dynamic cache key if parameter key is specified
    if (options?.key) {
      const args = context.getArgs();
      const paramIndex = context
        .getHandler()
        .toString()
        .match(/\(([^)]*)\)/);
      if (paramIndex && paramIndex[1]) {
        const params = paramIndex[1].split(',').map((p) => p.trim());
        const keyParamIndex = params.findIndex((p) =>
          p.startsWith(options.key || ''),
        );
        if (keyParamIndex !== -1 && args[keyParamIndex] !== undefined) {
          cacheKey = `${cacheKeyPrefix}:${args[keyParamIndex]}`;
        }
      }
    }

    const cachedData = await this.cacheManager.get(cacheKey);

    if (cachedData) {
      console.log(`Returning cached data for key: ${cacheKey}`);
      return of(cachedData);
    }

    return next.handle().pipe(
      tap((data) => {
        console.log(`Caching data for key: ${cacheKey}`);
        const ttl = options?.ttl || 60000; // Default 60 seconds
        void this.cacheManager.set(cacheKey, data, ttl);
      }),
    );
  }
}

import { CACHE_MANAGER } from '@nestjs/cache-manager';
import {
  CallHandler,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Cache } from 'cache-manager';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  CACHE_INVALIDATION_METADATA,
  CacheInvalidationMetadata,
} from '../decorators/cache-invalidation.decorator';

@Injectable()
export class CacheInvalidationInterceptor implements NestInterceptor {
  constructor(@Inject(CACHE_MANAGER) private readonly cacheManager: Cache) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = context.getHandler();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const metadata: CacheInvalidationMetadata[] =
      Reflect.getMetadata(CACHE_INVALIDATION_METADATA, handler) || [];

    return next.handle().pipe(
      tap(() => {
        if (metadata.length === 0) {
          return;
        }

        // Handle multiple @CacheInvalidation decorators
        const args = context.getArgs();
        for (const item of metadata) {
          const { cacheKeyPrefix, options } = item;
          let cacheKey = cacheKeyPrefix;

          // Build dynamic cache key if parameter key is specified
          if (options?.key) {
            const handlerStr = handler.toString();
            const paramMatch = handlerStr.match(/\(([^)]*)\)/);
            if (paramMatch && paramMatch[1]) {
              const params = paramMatch[1].split(',').map((p) => p.trim());
              const keyParamIndex = params.findIndex((p) =>
                p.startsWith(options.key as string),
              );
              if (keyParamIndex !== -1 && args[keyParamIndex] !== undefined) {
                cacheKey = `${cacheKeyPrefix}:${args[keyParamIndex]}`;
              }
            }
          }

          void this.cacheManager.del(cacheKey);
          console.log(`Cache key ${cacheKey} invalidated.`);
        }
      }),
    );
  }
}

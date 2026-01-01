import { SetMetadata } from '@nestjs/common';

export const CACHEABLE_KEY = 'cacheable_key';

export interface CacheableOptions {
  key?: string;
  ttl?: number;
}

export const Cacheable = (
  cacheKeyPrefix: string,
  options?: CacheableOptions,
) => SetMetadata(CACHEABLE_KEY, { cacheKeyPrefix, options });

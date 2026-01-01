import { SetMetadata } from '@nestjs/common';

export const CACHE_INVALIDATION_METADATA = 'cache_invalidation_metadata';

export interface CacheInvalidationOptions {
  key?: string;
}

export interface CacheInvalidationMetadata {
  cacheKeyPrefix: string;
  options?: CacheInvalidationOptions;
}

export const CacheInvalidation = (
  cacheKeyPrefix: string,
  options?: CacheInvalidationOptions,
) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    const existingMetadata: CacheInvalidationMetadata[] =
      Reflect.getMetadata(CACHE_INVALIDATION_METADATA, descriptor.value) || [];

    existingMetadata.push({ cacheKeyPrefix, options });

    Reflect.defineMetadata(
      CACHE_INVALIDATION_METADATA,
      existingMetadata,
      descriptor.value,
    );

    return descriptor;
  };
};

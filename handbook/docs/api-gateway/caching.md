---
sidebar_position: 6
---
# Caching Layer

## Overview

Caching stores frequently accessed data in fast storage to reduce latency, database load, and improve overall system performance.

## Cache Levels

```
┌──────────────────────────────────────┐
│          Client Request              │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│      1. In-Memory Cache (Node)       │ ← Fastest (microseconds)
│      Map, LRU Cache                  │
└──────────────┬───────────────────────┘
               │ Miss
               ▼
┌──────────────────────────────────────┐
│      2. Redis Cache                  │ ← Fast (milliseconds)
│      Shared across instances         │
└──────────────┬───────────────────────┘
               │ Miss
               ▼
┌──────────────────────────────────────┐
│      3. Database                     │ ← Slow (tens of ms)
│      Source of truth                 │
└──────────────────────────────────────┘
```

## In-Memory Caching

### Simple Map Cache

```typescript
@Injectable()
export class MemoryCache {
  private cache = new Map<string, { value: any; expiresAt: number }>();

  set(key: string, value: any, ttlSeconds: number = 300) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + (ttlSeconds * 1000)
    });
  }

  get(key: string): any | null {
    const item = this.cache.get(key);

    if (!item) {
      return null;
    }

    // Check expiration
    if (Date.now() > item.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  delete(key: string) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }
}
```

### LRU Cache

Least Recently Used cache with size limit.

```typescript
import LRU from 'lru-cache';

@Injectable()
export class LruCacheService {
  private cache: LRU<string, any>;

  constructor() {
    this.cache = new LRU({
      max: 500,              // Maximum 500 items
      maxAge: 1000 * 60 * 5, // 5 minutes TTL
      updateAgeOnGet: true,  // Reset TTL on access
    });
  }

  set(key: string, value: any, ttl?: number) {
    this.cache.set(key, value, ttl);
  }

  get(key: string): any {
    return this.cache.get(key);
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string) {
    this.cache.del(key);
  }

  getStats() {
    return {
      itemCount: this.cache.itemCount,
      length: this.cache.length
    };
  }
}
```

## Redis Caching

### Basic Redis Cache

```typescript
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisCacheService {
  constructor(private redis: Redis) {}

  async set(key: string, value: any, ttl: number = 300): Promise<void> {
    await this.redis.setex(
      key,
      ttl,
      JSON.stringify(value)
    );
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    return (await this.redis.exists(key)) === 1;
  }

  async ttl(key: string): Promise<number> {
    return this.redis.ttl(key);
  }

  async flush(): Promise<void> {
    await this.redis.flushdb();
  }
}
```

### Cache-Aside Pattern

Application manages cache explicitly.

```typescript
@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private cache: RedisCacheService
  ) {}

  async getUser(id: string): Promise<User> {
    const cacheKey = `user:${id}`;

    // 1. Check cache
    const cached = await this.cache.get<User>(cacheKey);
    if (cached) {
      console.log('Cache hit');
      return cached;
    }

    // 2. Cache miss - fetch from database
    console.log('Cache miss');
    const user = await this.userRepository.findOne(id);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // 3. Store in cache
    await this.cache.set(cacheKey, user, 300); // 5 minutes

    return user;
  }

  async updateUser(id: string, data: UpdateUserDto): Promise<User> {
    const user = await this.userRepository.update(id, data);

    // Invalidate cache
    await this.cache.delete(`user:${id}`);

    return user;
  }
}
```

### NestJS Cache Interceptor

```typescript
// cache.interceptor.ts
@Injectable()
export class HttpCacheInterceptor implements NestInterceptor {
  constructor(private cacheManager: Cache) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const cacheKey = this.generateCacheKey(request);

    // Check cache
    const cached = await this.cacheManager.get(cacheKey);
    if (cached) {
      return of(cached);
    }

    return next.handle().pipe(
      tap(async (response) => {
        // Cache the response
        await this.cacheManager.set(cacheKey, response, { ttl: 60 });
      })
    );
  }

  private generateCacheKey(request: any): string {
    return `${request.method}:${request.url}`;
  }
}
```

**Usage:**

```typescript
@Controller('api')
export class UsersController {
  @Get('users')
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(300) // 5 minutes
  async getUsers() {
    return this.userService.findAll();
  }

  @Get('users/:id')
  @UseInterceptors(HttpCacheInterceptor)
  @CacheTTL(600) // 10 minutes
  async getUser(@Param('id') id: string) {
    return this.userService.findOne(id);
  }
}
```

## Caching Strategies

### 1. Write-Through Cache

Write to cache and database simultaneously.

```typescript
async createUser(data: CreateUserDto): Promise<User> {
  // 1. Write to database
  const user = await this.userRepository.save(data);

  // 2. Write to cache
  await this.cache.set(`user:${user.id}`, user, 300);

  return user;
}
```

### 2. Write-Behind Cache

Write to cache immediately, database asynchronously.

```typescript
@Injectable()
export class WriteBehindCache {
  private writeQueue: Array<{ key: string; value: any }> = [];

  constructor(
    private cache: RedisCacheService,
    private repository: Repository<any>
  ) {
    // Flush queue periodically
    setInterval(() => this.flushQueue(), 5000);
  }

  async set(key: string, value: any) {
    // Write to cache immediately
    await this.cache.set(key, value);

    // Queue database write
    this.writeQueue.push({ key, value });
  }

  private async flushQueue() {
    const items = this.writeQueue.splice(0, this.writeQueue.length);

    if (items.length === 0) return;

    try {
      // Batch write to database
      await this.repository.save(items.map(item => item.value));
    } catch (error) {
      console.error('Failed to flush write-behind queue', error);
      // Re-queue items
      this.writeQueue.unshift(...items);
    }
  }
}
```

### 3. Cache Invalidation

**Time-based:**
```typescript
// Set TTL
await cache.set('user:123', user, 300); // 5 minutes
```

**Event-based:**
```typescript
@EventPattern('user-updated')
async handleUserUpdate(event: UserUpdatedEvent) {
  // Invalidate cache when user is updated
  await this.cache.delete(`user:${event.userId}`);
}
```

**Pattern-based:**
```typescript
async invalidateUserCache(userId: string) {
  const pattern = `user:${userId}:*`;
  const keys = await this.redis.keys(pattern);
  
  if (keys.length > 0) {
    await this.redis.del(...keys);
  }
}
```

## Multi-Level Caching

Combine in-memory and Redis caching.

```typescript
@Injectable()
export class MultiLevelCache {
  constructor(
    private memoryCache: LruCacheService,
    private redisCache: RedisCacheService
  ) {}

  async get<T>(key: string): Promise<T | null> {
    // 1. Check memory cache (fastest)
    let value = this.memoryCache.get(key);
    if (value) {
      return value;
    }

    // 2. Check Redis (fast)
    value = await this.redisCache.get<T>(key);
    if (value) {
      // Populate memory cache
      this.memoryCache.set(key, value, 60);
      return value;
    }

    return null;
  }

  async set(key: string, value: any, ttl: number = 300) {
    // Write to both caches
    this.memoryCache.set(key, value, Math.min(ttl, 60)); // Max 1 min in memory
    await this.redisCache.set(key, value, ttl);
  }

  async delete(key: string) {
    this.memoryCache.delete(key);
    await this.redisCache.delete(key);
  }
}
```

## Cache Warming

Pre-populate cache with frequently accessed data.

```typescript
@Injectable()
export class CacheWarmer {
  constructor(
    private cache: RedisCacheService,
    private userService: UserService
  ) {}

  @Cron('0 */30 * * * *') // Every 30 minutes
  async warmCache() {
    console.log('Warming cache...');

    // Fetch hot data
    const popularUsers = await this.userService.getPopularUsers();

    // Cache each user
    for (const user of popularUsers) {
      await this.cache.set(`user:${user.id}`, user, 3600);
    }

    console.log(`Cached ${popularUsers.length} popular users`);
  }
}
```

## Cache Stampede Prevention

Prevent multiple simultaneous requests from hitting the database.

```typescript
@Injectable()
export class StampedeProtectedCache {
  private locks = new Map<string, Promise<any>>();

  constructor(private cache: RedisCacheService) {}

  async get<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    // Check cache
    const cached = await this.cache.get<T>(key);
    if (cached) {
      return cached;
    }

    // Check if another request is already fetching
    if (this.locks.has(key)) {
      return this.locks.get(key);
    }

    // Create promise for this fetch
    const promise = (async () => {
      try {
        const value = await fetchFn();
        await this.cache.set(key, value, ttl);
        return value;
      } finally {
        this.locks.delete(key);
      }
    })();

    this.locks.set(key, promise);
    return promise;
  }
}
```

**Usage:**

```typescript
const user = await this.stampedeCache.get(
  `user:${id}`,
  () => this.userRepository.findOne(id),
  300
);
```

## Cache Patterns

### Query Result Caching

```typescript
@Injectable()
export class QueryCache {
  async findWithCache<T>(
    cacheKey: string,
    query: () => Promise<T>,
    ttl: number = 300
  ): Promise<T> {
    const cached = await this.cache.get<T>(cacheKey);
    if (cached) return cached;

    const result = await query();
    await this.cache.set(cacheKey, result, ttl);
    return result;
  }
}

// Usage
const users = await this.queryCache.findWithCache(
  'users:active',
  () => this.userRepository.find({ where: { active: true } }),
  600
);
```

### Fragment Caching

Cache parts of the response.

```typescript
@Get('dashboard')
async getDashboard() {
  const [users, orders, stats] = await Promise.all([
    this.getCachedUsers(),
    this.getCachedOrders(),
    this.calculateStats() // Not cached, always fresh
  ]);

  return { users, orders, stats };
}

private async getCachedUsers() {
  return this.cache.remember('dashboard:users', 
    () => this.userService.getRecentUsers(),
    300
  );
}
```

### ETags for HTTP Caching

```typescript
@Get('users/:id')
async getUser(
  @Param('id') id: string,
  @Req() req: Request,
  @Res() res: Response
) {
  const user = await this.userService.findOne(id);
  
  // Generate ETag
  const etag = this.generateETag(user);
  
  // Check If-None-Match header
  if (req.headers['if-none-match'] === etag) {
    return res.status(304).send(); // Not Modified
  }
  
  return res
    .setHeader('ETag', etag)
    .setHeader('Cache-Control', 'max-age=300')
    .json(user);
}

private generateETag(data: any): string {
  return createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');
}
```

## Monitoring

```typescript
@Injectable()
export class CacheMetrics {
  private hits = 0;
  private misses = 0;

  recordHit() {
    this.hits++;
  }

  recordMiss() {
    this.misses++;
  }

  getHitRate(): number {
    const total = this.hits + this.misses;
    return total > 0 ? (this.hits / total) * 100 : 0;
  }

  getStats() {
    return {
      hits: this.hits,
      misses: this.misses,
      hitRate: this.getHitRate().toFixed(2) + '%'
    };
  }

  reset() {
    this.hits = 0;
    this.misses = 0;
  }
}
```

## Best Practices

### 1. Use Appropriate TTL

```typescript
// Short TTL for frequently changing data
await cache.set('stock-price', price, 10); // 10 seconds

// Medium TTL for semi-static data
await cache.set('user-profile', user, 300); // 5 minutes

// Long TTL for static data
await cache.set('config', config, 3600); // 1 hour
```

### 2. Cache Keys Convention

```typescript
//  GOOD: Namespaced, descriptive keys
`user:${userId}`
`post:${postId}:comments`
`search:${query}:page:${page}`

//  BAD: Ambiguous keys
`123`
`data`
`result`
```

### 3. Handle Cache Failures Gracefully

```typescript
async getUser(id: string): Promise<User> {
  try {
    const cached = await this.cache.get(`user:${id}`);
    if (cached) return cached;
  } catch (error) {
    console.error('Cache error, falling back to database', error);
  }

  // Always return from database if cache fails
  return this.userRepository.findOne(id);
}
```

### 4. Version Cache Keys

```typescript
const CACHE_VERSION = 'v2';

async getCachedData(key: string) {
  return this.cache.get(`${CACHE_VERSION}:${key}`);
}
```

## Next Steps

- Learn about [Rate Limiting](./rate-limiting.md)
- Explore [Circuit Breaker](./circuit-breaker.md)
- Check [Distributed Cache](../distributed-cache/index.md)

---
sidebar_position: 4
---

# Cloud Cache

## Tổng quan

Cloud Cache là implementation của Cloudflare Workers Cache API cho NestJS, cung cấp giải pháp in-memory caching đơn giản với quản lý TTL (Time-To-Live) tự động. Module này được thiết kế để:

- Cung cấp API tương tự Cloudflare Workers Cache (match, put, delete)
- Hỗ trợ Cache-Control headers (s-maxage, max-age) 
- Tự động xử lý cache expiration
- Theo dõi cache statistics và monitoring
- Zero dependencies - pure TypeScript implementation

**Sơ đồ hoạt động:**

```
                                            ┌─────────────────┐
                                            │   HTTP Request  │
                                            │  /cloud-cache/* │
                                            └────────┬────────┘
                                                    │
                                                    ▼
                                            ┌─────────────────┐
                                            │ CloudCache      │
                                            │  Controller     │
                                            └────────┬────────┘
                                                    │
                                                    ▼
                                            ┌─────────────────┐
                                            │ CloudCache      │
                                            │   Service       │
                                            │  - match()      │
                                            │  - put()        │
                                            │  - delete()     │
                                            └────────┬────────┘
                                                    │
                                                    ▼
                                            ┌─────────────────┐
                                            │   In-Memory     │
                                            │   Map Storage   │
                                            └─────────────────┘
```

## Pre-conditions

### Không cần cài đặt thêm

Module Cloud Cache đã được tích hợp sẵn trong backend, không cần cài đặt package bổ sung.

### Kiểm tra module

Đảm bảo `CloudCacheModule` đã được import trong `app.module.ts`:

```typescript
import { CloudCacheModule } from './cache/cloud-cache/cloud-cache.module';

@Module({
  imports: [CloudCacheModule, /* other modules */],
})
export class AppModule {}
```

## NestJS Setup

### Module Structure

```
backend/src/cache/cloud-cache/
├── cloud-cache.controller.ts       # HTTP endpoints
├── cloud-cache.service.ts          # Core caching logic
├── cloud-cache.module.ts           # NestJS module
├── cloud-cache.config.ts           # Configuration
└── cloud-cache.examples.ts         # Usage examples
```

### Service Implementation

```typescript
@Injectable()
export class CloudCacheService {
  private readonly cache = new Map<string, CachedResponse>();
  
  // Get cached data
  match(url: string): CachedResponse | null {
    const cached = this.cache.get(url);
    if (!cached || !this.isCacheValid(cached)) {
      return null;
    }
    return cached;
  }
  
  // Store data with TTL
  put(url: string, data: any, options?: { headers?: Record<string, string> }): void {
    const maxAge = this.parseMaxAge(options?.headers?.['cache-control']);
    this.cache.set(url, {
      body: JSON.stringify(data),
      headers: options?.headers || {},
      status: 200,
      cachedAt: Date.now(),
      maxAge,
    });
  }
  
  // Delete cached data
  delete(url: string): boolean {
    return this.cache.delete(url);
  }
  
  // Clear all cache
  clear(): void {
    this.cache.clear();
  }
  
  // Get statistics
  getStats(): { totalEntries: number; validEntries: number; expiredEntries: number } {
    // Implementation...
  }
}
```

### Controller Endpoints

```typescript
@Controller('cloud-cache')
export class CloudCacheController {
  constructor(private readonly cloudCacheService: CloudCacheService) {}

  @Get('match')
  getCachedData(@Query('url') url: string) {
    const cached = this.cloudCacheService.match(url);
    // Return cached data or miss
  }

  @Post('put')
  putCachedData(@Body() body: { url: string; data: any; ttl?: number }) {
    this.cloudCacheService.put(url, data, {
      headers: { 'cache-control': `s-maxage=${ttl}` }
    });
  }

  @Delete('delete')
  deleteCachedData(@Query('url') url: string) {
    return this.cloudCacheService.delete(url);
  }

  @Get('stats')
  getStats() {
    return this.cloudCacheService.getStats();
  }
}
```

## API Endpoints

### 1. Example Endpoint - Demo tự động

**GET** `/cloud-cache/example/:resource`

Endpoint demo tự động fetch và cache data từ JSONPlaceholder API.

```bash
# Lần đầu - fetch từ origin
curl http://localhost:8080/cloud-cache/example/users

# Lần sau - lấy từ cache (nhanh hơn)
curl http://localhost:8080/cloud-cache/example/users
```

**Response (Cache MISS):**
```json
{
  "source": "origin",
  "data": [...],
  "message": "Data fetched and cached"
}
```

**Response (Cache HIT):**
```json
{
  "source": "cache",
  "data": [...],
  "cachedAt": "2025-11-21T10:30:00.000Z",
  "age": 5
}
```

### 2. Store Data - Lưu vào cache

**POST** `/cloud-cache/put`

```bash
curl -X POST http://localhost:8080/cloud-cache/put \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://api.myapp.com/products",
    "data": {
      "products": [
        {"id": 1, "name": "iPhone 15", "price": 999},
        {"id": 2, "name": "MacBook Pro", "price": 2499}
      ]
    },
    "ttl": 120
  }'
```

**Request Body:**
- `url` (string, required): Cache key
- `data` (any, required): Data cần cache
- `ttl` (number, optional): Time-to-live tính bằng giây (default: 10s)

**Response:**
```json
{
  "success": true,
  "message": "Data cached successfully",
  "url": "https://api.myapp.com/products",
  "ttl": 120
}
```

### 3. Get Cached Data - Lấy dữ liệu

**GET** `/cloud-cache/match?url={url}`

```bash
curl "http://localhost:8080/cloud-cache/match?url=https://api.myapp.com/products"
```

**Response (Cache HIT):**
```json
{
  "cached": true,
  "data": {
    "products": [...]
  },
  "headers": {
    "cache-control": "s-maxage=120"
  },
  "cachedAt": "2025-11-21T10:30:00.000Z",
  "age": 15,
  "maxAge": 120
}
```

**Response (Cache MISS):**
```json
{
  "cached": false,
  "message": "Cache miss"
}
```

### 4. Cache Statistics - Thống kê

**GET** `/cloud-cache/stats`

```bash
curl http://localhost:8080/cloud-cache/stats
```

**Response:**
```json
{
  "totalEntries": 10,
  "validEntries": 8,
  "expiredEntries": 2
}
```

### 5. Delete Cache - Xóa cache cụ thể

**DELETE** `/cloud-cache/delete?url={url}`

```bash
curl -X DELETE "http://localhost:8080/cloud-cache/delete?url=https://api.myapp.com/products"
```

**Response:**
```json
{
  "success": true,
  "message": "Cache deleted successfully"
}
```

### 6. Clear All Cache - Xóa toàn bộ

**DELETE** `/cloud-cache/clear`

```bash
curl -X DELETE http://localhost:8080/cloud-cache/clear
```

**Response:**
```json
{
  "success": true,
  "message": "All cache cleared"
}
```

### 7. Cleanup Expired - Dọn dẹp cache hết hạn

**POST** `/cloud-cache/cleanup`

```bash
curl -X POST http://localhost:8080/cloud-cache/cleanup
```

**Response:**
```json
{
  "success": true,
  "cleaned": 3,
  "message": "Cleaned up 3 expired entries"
}
```

## Usage Examples

### Basic Caching Pattern

```typescript
import { Injectable } from '@nestjs/common';
import { CloudCacheService } from './cache/cloud-cache/cloud-cache.service';

@Injectable()
export class ProductService {
  constructor(private readonly cloudCache: CloudCacheService) {}

  async getProducts(): Promise<any[]> {
    const cacheKey = 'https://api.store.com/products';
    
    // Kiểm tra cache trước
    const cached = this.cloudCache.match(cacheKey);
    if (cached) {
      console.log('✅ Cache HIT');
      return JSON.parse(cached.body);
    }

    // Fetch từ database/API
    console.log('❌ Cache MISS');
    const products = await this.fetchFromDatabase();

    // Lưu vào cache với TTL 5 phút
    this.cloudCache.put(cacheKey, products, {
      headers: { 'cache-control': 's-maxage=300' }
    });

    return products;
  }
}
```

### Content-Based TTL

```typescript
async fetchWithSmartTtl(url: string) {
  const cached = this.cloudCache.match(url);
  if (cached) return JSON.parse(cached.body);

  const data = await this.fetchData(url);

  // TTL khác nhau theo loại content
  let ttl = 60;
  if (url.includes('/static/')) ttl = 3600;      // 1 giờ cho static
  if (url.includes('/api/')) ttl = 30;           // 30s cho API
  if (url.includes('/config/')) ttl = 300;       // 5 phút cho config

  this.cloudCache.put(url, data, {
    headers: { 'cache-control': `s-maxage=${ttl}` }
  });

  return data;
}
```

### Cache Invalidation

```typescript
async updateProduct(id: string, updates: any) {
  // Cập nhật database
  const product = await this.repository.update(id, updates);

  // Invalidate các cache liên quan
  this.cloudCache.delete(`https://api.store.com/products/${id}`);
  this.cloudCache.delete('https://api.store.com/products');
  this.cloudCache.delete('https://api.store.com/products/featured');

  return product;
}
```

### Cache Warming

```typescript
@Injectable()
export class CacheWarmerService implements OnModuleInit {
  constructor(private readonly cloudCache: CloudCacheService) {}

  async onModuleInit() {
    const criticalUrls = [
      'https://api.example.com/config',
      'https://api.example.com/settings',
      'https://api.example.com/categories',
    ];

    for (const url of criticalUrls) {
      const data = await this.fetchData(url);
      this.cloudCache.put(url, data, {
        headers: { 'cache-control': 's-maxage=3600' }
      });
    }
  }
}
```

## Cache-Control Headers

Service hỗ trợ các Cache-Control directives sau:

| Directive | Mô tả | Ví dụ |
|-----------|-------|-------|
| `s-maxage=<seconds>` | TTL theo Cloudflare style (ưu tiên) | `s-maxage=60` |
| `max-age=<seconds>` | TTL thay thế | `max-age=60` |
| Default | 10 giây nếu không chỉ định | - |

**Ví dụ:**
```typescript
// Cache 1 giờ
this.cloudCache.put(url, data, {
  headers: { 'cache-control': 's-maxage=3600' }
});

// Cache 5 phút
this.cloudCache.put(url, data, {
  headers: { 'cache-control': 'max-age=300' }
});

// Sử dụng default (10 giây)
this.cloudCache.put(url, data);
```

## TTL Recommendations

| Use Case | TTL | Cache-Control |
|----------|-----|---------------|
| Static content | 1 hour | `s-maxage=3600` |
| API responses | 5 minutes | `s-maxage=300` |
| Dynamic data | 1 minute | `s-maxage=60` |
| Real-time data | 10 seconds | `s-maxage=10` |
| User-specific | 30 seconds | `s-maxage=30` |

## So sánh với Cloudflare Workers

### Cloudflare Workers Code

```javascript
export default {
  async fetch(request, env, ctx) {
    const cache = caches.default;
    let response = await cache.match(request);
    
    if (!response) {
      response = await fetch(request);
      response = new Response(response.body, response);
      response.headers.append("Cache-Control", "s-maxage=10");
      ctx.waitUntil(cache.put(request, response.clone()));
    }
    
    return response;
  }
};
```

### NestJS Equivalent

```typescript
async fetchData(url: string) {
  const cached = this.cloudCache.match(url);
  
  if (!cached) {
    const response = await fetch(url);
    const data = await response.json();
    
    this.cloudCache.put(url, data, {
      headers: { 'cache-control': 's-maxage=10' }
    });
    
    return data;
  }
  
  return JSON.parse(cached.body);
}
```

## Best Practices

### 1. Chọn TTL phù hợp

```typescript
const TTL_CONFIG = {
  STATIC: 3600,      // 1 giờ
  API: 300,          // 5 phút
  DYNAMIC: 60,       // 1 phút
  REALTIME: 10,      // 10 giây
  USER_SPECIFIC: 30, // 30 giây
};
```

### 2. Monitor Cache Performance

```typescript
@Cron('0 * * * *') // Mỗi giờ
async monitorCache() {
  const stats = this.cloudCache.getStats();
  const hitRate = (stats.validEntries / stats.totalEntries) * 100;
  
  if (hitRate < 50) {
    this.logger.warn(`Low cache hit rate: ${hitRate}%`);
  }
  
  if (stats.expiredEntries > 100) {
    this.cloudCache.cleanupExpired();
  }
}
```

### 3. Graceful Error Handling

```typescript
async getData(url: string) {
  try {
    const cached = this.cloudCache.match(url);
    if (cached) return JSON.parse(cached.body);

    const data = await this.fetchFromOrigin(url);
    this.cloudCache.put(url, data);
    return data;
  } catch (error) {
    this.logger.error('Cache error:', error);
    return this.fetchFromOrigin(url); // Fallback
  }
}
```

### 4. Consistent Cache Keys

```typescript
// Good: Consistent format
const cacheKey = `https://api.example.com/products/${id}`;

// Bad: Inconsistent keys
const cacheKey1 = `product_${id}`;
const cacheKey2 = `products/${id}`;
```

### 5. Cache Invalidation Strategy

```typescript
class ProductService {
  async updateProduct(id: string, data: any) {
    const product = await this.repository.update(id, data);
    
    // Invalidate tất cả cache liên quan
    this.cloudCache.delete(`/api/products/${id}`);
    this.cloudCache.delete('/api/products');
    this.cloudCache.delete('/api/products/featured');
    
    return product;
  }
}
```

## Resources

- [Cloudflare Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/)
- [Cloudflare Cache Examples](https://developers.cloudflare.com/workers/examples/cache-api/)
- [HTTP Caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Caching)
- [Cache-Control Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Cache-Control)
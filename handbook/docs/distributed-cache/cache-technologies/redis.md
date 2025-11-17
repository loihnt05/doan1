---
sidebar_position: 1
---

# Redis

# Tổng quan

Redis là in-memory data store tốc độ cao thường được dùng cho caching, pub/sub, queue và các cấu trúc dữ liệu nâng cao. Trong dự án này chúng ta kết hợp `@nestjs/cache-manager` với `Keyv` và Redis để:

- Tạo multi-layer cache (memory + Redis) nhằm giảm tải database.
- Xuất các endpoint REST mô phỏng từng cấu trúc dữ liệu cơ bản của Redis, giúp thử nghiệm nhanh trong cùng backend NestJS.
- Tận dụng Redis Insight để quan sát giá trị được ghi/đọc theo thời gian thực.

Sơ đồ đơn giản:

1. Request đến `RedisController` (`/redis/*`).
2. `RedisService` sử dụng `CacheManager` cho cache memory và `redisProvider` (client gốc) cho các thao tác dữ liệu chuyên biệt.
3. Redis Stack lưu trữ dữ liệu, Insight hiển thị nội dung trực quan.

## Pre-conditions

### Redis server + Insight

Sử dụng Redis Stack (tích hợp Redis Insight) từ Docker Hub: https://hub.docker.com/r/redis/redis-stack

```bash
docker run -d --name redis-stack \
	-p 6379:6379 -p 8001:8001 \
	-e REDIS_ARGS="--requirepass mypassword" \
	redis/redis-stack:latest
```

Truy cập Redis Insight tại http://localhost:8001/redis-stack/browser.

:::note
Nếu bạn bật password, hãy cập nhật `redis.provider.ts` để sử dụng URL dạng `redis://:mypassword@localhost:6379`.
:::

### Package backend

Các gói cần thiết (đã có trong `backend/package.json`, ghi chú lại để team khác dùng):

```bash
pnpm add @nestjs/cache-manager cache-manager keyv cacheable @keyv/redis redis
```

## NestJS Setup

### Module cache nhiều tầng

```ts title="backend/src/cache/redis/redis.module.ts"
@Module({
  imports: [
    CacheModule.registerAsync({
      useFactory: () => ({
        stores: [
          new Keyv({
            store: new CacheableMemory({ ttl: 60_000, lruSize: 5000 }),
          }),
          new KeyvRedis("redis://localhost:6379"),
        ],
      }),
    }),
  ],
  controllers: [RedisController],
  providers: [RedisService, redisProvider],
  exports: [redisProvider],
})
export class RedisModule {}
```

### Provider Redis thuần

```ts title="backend/src/cache/redis/redis.provider.ts"
export const REDIS = "REDIS_CLIENT";

export const redisProvider = {
  provide: REDIS,
  useFactory: async () => {
    const client = createClient({ url: "redis://localhost:6379" });
    await client.connect();
    return client;
  },
};
```

Sau khi tạo module, import `RedisModule` vào `AppModule` để bật toàn bộ endpoint:

```ts title="backend/src/app.module.ts"
@Module({
  imports: [RedisModule /*, ... */],
})
export class AppModule {}
```

## Dịch vụ & controller

`RedisService` kết hợp `CacheManager` và Redis client:

```ts title="backend/src/cache/redis/redis.service.ts"
@Injectable()
export class RedisService {
  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    @Inject(REDIS) private redis: RedisClientType
  ) {}

  async getNumberCache() {
    /* ... */
  }
  async setString(key: string, value: string, ttl?: number) {
    /* ... */
  }
  async getHash(key: string) {
    /* ... */
  }
  async setHash(key: string, field: string, value: string) {
    /* ... */
  }
  async setList(key: string, values: string[]) {
    /* ... */
  }
  async getList(key: string) {
    /* ... */
  }
  async setSet(key: string, members: Array<{ value: string; score: number }>) {
    /* ... */
  }
  async getSortedSet(key: string) {
    /* ... */
  }
}
```

`RedisController` ánh xạ các REST endpoint dưới prefix `/redis`.

| Method | Endpoint                          | Mô tả                                                |
| ------ | --------------------------------- | ---------------------------------------------------- |
| GET    | `/redis/get-number-cache`         | Ví dụ cache 60s bằng `CacheInterceptor`.             |
| POST   | `/redis/set-cache-key`            | Ghi key demo `my-key`.                               |
| GET    | `/redis/get-cache-key`            | Đọc `my-key`.                                        |
| POST   | `/redis/string/:key/:value/:ttl?` | Ghi string với TTL (ms).                             |
| GET    | `/redis/string/:key`              | Đọc string.                                          |
| POST   | `/redis/hash/:key`                | Body `{ field, value }`.                             |
| GET    | `/redis/hash/:key`                | Đọc toàn bộ hash.                                    |
| POST   | `/redis/list/:key`                | Body `{ values: string[] }`.                         |
| GET    | `/redis/list/:key`                | Đọc list (LRANGE).                                   |
| POST   | `/redis/set/:key`                 | Body `{ members: [{ value, score }] }` (sorted set). |
| GET    | `/redis/set/:key`                 | Đọc set (SMEMBERS).                                  |
| GET    | `/redis/zset/:key`                | Đọc sorted set cùng key (ZRANGE).                    |

## Ví dụ sử dụng

### 1. Cache số ngẫu nhiên

```bash
curl http://localhost:3000/redis/get-number-cache
```

Phản hồi lần đầu: `{"data":123,"fromCache":false}` – lần sau trong 60s sẽ trả `fromCache: true`.

### 2. String

```bash
curl -X POST http://localhost:3000/redis/string/user:1/John/60000
curl http://localhost:3000/redis/string/user:1
```

Kết quả hiển thị ngay ở Redis Insight phần Keys Browser.

### 3. Hash

```bash
curl -X POST http://localhost:3000/redis/hash/profile:1 \
	-H 'Content-Type: application/json' \
	-d '{"field":"email","value":"user@example.com"}'
curl http://localhost:3000/redis/hash/profile:1
```

### 4. List

```bash
curl -X POST http://localhost:3000/redis/list/tasks \
	-H 'Content-Type: application/json' \
	-d '{"values":["task-1","task-2","task-3"]}'
curl http://localhost:3000/redis/list/tasks
```

### 5. Set & Sorted Set (Leaderboard)

```bash
curl -X POST http://localhost:3000/redis/set/leaderboard \
	-H 'Content-Type: application/json' \
	-d '{"members":[{"value":"alice","score":120},{"value":"bob","score":95}]}'
curl http://localhost:3000/redis/zset/leaderboard
```

Để chỉ xem set dưới dạng `SMEMBERS`, gọi: `curl http://localhost:3000/redis/set/leaderboard`.

## Gợi ý mở rộng

- Di chuyển URL Redis vào `ConfigModule` để dễ cấu hình nhiều môi trường.
- Bổ sung `setZSet` riêng biệt hoặc dùng DTOs để tránh nhầm lẫn giữa Set/ZSet.
- Tạo e2e test cho từng endpoint để đảm bảo hành vi nhất quán khi refactor.

Tài liệu này nhằm giúp bạn có cái nhìn end-to-end: chạy Redis Stack, cấu hình NestJS, và thử nghiệm từng cấu trúc dữ liệu ngay qua REST API.

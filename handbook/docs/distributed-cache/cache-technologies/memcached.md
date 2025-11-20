---
sidebar_position: 2
---

# Memcached

# Tổng quan

Memcached là hệ thống cache phân tán in-memory tốc độ cao, đơn giản và hiệu quả, thường được sử dụng để giảm tải cho database và tăng tốc độ phản hồi của ứng dụng. Trong dự án này chúng ta tích hợp Memcached với NestJS để:

- Lưu trữ dữ liệu tạm thời trong bộ nhớ với TTL (Time To Live) linh hoạt.
- Giảm thiểu số lượng truy vấn đến database.
- Hỗ trợ các thao tác cơ bản: set, get, delete, increment, decrement.
- Xuất các endpoint REST để dễ dàng thử nghiệm và tích hợp.

Sơ đồ đơn giản:

1. Request đến `MemcachedController` (`/memcached/*`).
2. `MemcachedService` kết nối với Memcached server để thực hiện các thao tác cache.
3. Memcached server lưu trữ dữ liệu trong bộ nhớ RAM.

## Pre-conditions

### Memcached server

Sử dụng Memcached từ Docker Hub: https://hub.docker.com/_/memcached

```bash
docker run -d --name memcached \
  -p 11211:11211 \
  memcached:latest
```

:::tip
Memcached mặc định chạy trên port 11211. Bạn có thể thay đổi cấu hình memory limit bằng cách thêm tham số `-m` (MB):
```bash
docker run -d --name memcached -p 11211:11211 memcached:latest -m 256
```
:::

### Package backend

Các gói cần thiết (đã có trong `backend/package.json`):

```bash
pnpm add memcached
pnpm add -D @types/memcached
```

## NestJS Setup

### Module Memcached

```ts title="backend/src/cache/memcached/memcached.module.ts"
import { Module } from '@nestjs/common';
import { MemcachedService } from './memcached.service';
import { MemcachedController } from './memcached.controller';

@Module({
  controllers: [MemcachedController],
  providers: [MemcachedService],
  exports: [MemcachedService],
})
export class MemcachedModule {}
```

### Configuration

```ts title="backend/src/cache/memcached/memcached.config.ts"
export const MEMCACHED_CONFIG = {
  servers: '127.0.0.1:11211',
  options: {
    retries: 10,
    retry: 10000,
    remove: true,
    failOverServers: [],
    timeout: 5000,
    idle: 5000,
  },
};
```

Sau khi tạo module, import `MemcachedModule` vào `AppModule` để bật toàn bộ endpoint:

```ts title="backend/src/app.module.ts"
@Module({
  imports: [MemcachedModule /*, ... */],
})
export class AppModule {}
```

## Dịch vụ & Controller

`MemcachedService` cung cấp các phương thức để tương tác với Memcached:

```ts title="backend/src/cache/memcached/memcached.service.ts"
@Injectable()
export class MemcachedService implements OnModuleInit, OnModuleDestroy {
  private memcached: MemcachedClient;

  async get<T>(key: string): Promise<T | null> {
    /* Lấy giá trị từ cache */
  }

  async set(key: string, value: unknown, lifetime: number = 3600): Promise<boolean> {
    /* Lưu giá trị vào cache với TTL */
  }

  async delete(key: string): Promise<boolean> {
    /* Xóa key khỏi cache */
  }

  async add(key: string, value: unknown, lifetime: number = 3600): Promise<boolean> {
    /* Thêm key mới (chỉ khi key chưa tồn tại) */
  }

  async replace(key: string, value: unknown, lifetime: number = 3600): Promise<boolean> {
    /* Thay thế giá trị (chỉ khi key đã tồn tại) */
  }

  async getMulti<T>(keys: string[]): Promise<Record<string, T>> {
    /* Lấy nhiều giá trị cùng lúc */
  }

  async increment(key: string, amount: number = 1): Promise<number | false> {
    /* Tăng giá trị số */
  }

  async decrement(key: string, amount: number = 1): Promise<number | false> {
    /* Giảm giá trị số */
  }

  async flush(): Promise<boolean> {
    /* Xóa toàn bộ dữ liệu trong cache */
  }

  async stats(): Promise<Record<string, unknown>> {
    /* Lấy thống kê từ server */
  }
}
```

`MemcachedController` cung cấp các REST endpoint dưới prefix `/memcached`:

| Method | Endpoint              | Mô tả                                              |
| ------ | --------------------- | -------------------------------------------------- |
| POST   | `/memcached/set`      | Body `{ key, value, ttl? }` - Lưu giá trị vào cache |
| GET    | `/memcached/get/:key` | Lấy giá trị từ cache theo key                       |
| DELETE | `/memcached/delete/:key` | Xóa key khỏi cache                               |
| POST   | `/memcached/add`      | Body `{ key, value, ttl? }` - Thêm key mới          |
| POST   | `/memcached/replace`  | Body `{ key, value, ttl? }` - Thay thế giá trị      |
| POST   | `/memcached/get-multi` | Body `{ keys: string[] }` - Lấy nhiều giá trị      |
| POST   | `/memcached/increment` | Body `{ key, amount? }` - Tăng giá trị số          |
| POST   | `/memcached/decrement` | Body `{ key, amount? }` - Giảm giá trị số          |
| POST   | `/memcached/flush`    | Xóa toàn bộ dữ liệu                                 |
| GET    | `/memcached/stats`    | Xem thống kê server                                 |

## Ví dụ sử dụng

### 1. Set & Get giá trị cơ bản

Lưu một giá trị vào cache với TTL 60 giây:

```bash
curl -X POST http://localhost:8080/memcached/set \
  -H 'Content-Type: application/json' \
  -d '{"key":"user:1","value":"John Doe","ttl":60}'
```

Phản hồi:
```json
{
  "success": true,
  "message": "Key 'user:1' has been set"
}
```

Lấy giá trị:

```bash
curl http://localhost:8080/memcached/get/user:1
```

Phản hồi:
```json
{
  "key": "user:1",
  "value": "John Doe",
  "found": true
}
```

### 2. Lưu trữ object JSON

```bash
curl -X POST http://localhost:8080/memcached/set \
  -H 'Content-Type: application/json' \
  -d '{
    "key": "user:profile:1",
    "value": {
      "id": 1,
      "name": "John Doe",
      "email": "john@example.com",
      "age": 30
    },
    "ttl": 3600
  }'
```

Lấy lại object:

```bash
curl http://localhost:8080/memcached/get/user:profile:1
```

### 3. Add (chỉ thêm nếu key chưa tồn tại)

```bash
curl -X POST http://localhost:8080/memcached/add \
  -H 'Content-Type: application/json' \
  -d '{"key":"counter","value":0,"ttl":3600}'
```

Nếu key đã tồn tại, thao tác sẽ thất bại.

### 4. Replace (chỉ thay thế nếu key đã tồn tại)

```bash
curl -X POST http://localhost:8080/memcached/replace \
  -H 'Content-Type: application/json' \
  -d '{"key":"user:1","value":"Jane Doe","ttl":60}'
```

### 5. Get Multiple (lấy nhiều key cùng lúc)

```bash
curl -X POST http://localhost:8080/memcached/get-multi \
  -H 'Content-Type: application/json' \
  -d '{"keys":["user:1","user:2","user:3"]}'
```

Phản hồi:
```json
{
  "values": {
    "user:1": "John Doe",
    "user:2": "Jane Smith"
  },
  "count": 2
}
```

### 6. Increment & Decrement

Khởi tạo counter:

```bash
curl -X POST http://localhost:8080/memcached/set \
  -H 'Content-Type: application/json' \
  -d '{"key":"page:views","value":"0","ttl":3600}'
```

Tăng giá trị:

```bash
curl -X POST http://localhost:8080/memcached/increment \
  -H 'Content-Type: application/json' \
  -d '{"key":"page:views","amount":1}'
```

Phản hồi:
```json
{
  "key": "page:views",
  "newValue": 1,
  "success": true
}
```

Giảm giá trị:

```bash
curl -X POST http://localhost:8080/memcached/decrement \
  -H 'Content-Type: application/json' \
  -d '{"key":"page:views","amount":1}'
```

### 7. Delete key

```bash
curl -X DELETE http://localhost:8080/memcached/delete/user:1
```

Phản hồi:
```json
{
  "success": true,
  "message": "Key 'user:1' has been deleted"
}
```

### 8. Xem thống kê server

```bash
curl http://localhost:8080/memcached/stats
```

Phản hồi sẽ chứa thông tin như:
- `curr_items`: Số lượng item hiện tại
- `total_items`: Tổng số item đã lưu
- `bytes`: Dung lượng đã sử dụng
- `cmd_get`: Số lần thực hiện lệnh GET
- `cmd_set`: Số lần thực hiện lệnh SET
- `get_hits`: Số lần GET thành công
- `get_misses`: Số lần GET không tìm thấy
- `evictions`: Số lần xóa item do hết bộ nhớ

### 9. Flush toàn bộ cache

:::danger Cảnh báo
Lệnh này sẽ xóa toàn bộ dữ liệu trong Memcached. Chỉ sử dụng trong môi trường development!
:::

```bash
curl -X POST http://localhost:8080/memcached/flush
```

## Cách kiểm tra key trong Memcached

### 1. Sử dụng telnet

Memcached hỗ trợ kết nối qua telnet để kiểm tra và thao tác trực tiếp:

```bash
telnet localhost 11211
```

Sau khi kết nối, bạn có thể sử dụng các lệnh:

**Lấy giá trị:**
```
get user:1
```

**Lấy nhiều giá trị:**
```
get user:1 user:2 user:3
```

**Set giá trị:**
```
set mykey 0 60 5
hello
```
(0 = flags, 60 = TTL giây, 5 = độ dài byte của "hello")

**Xem stats:**
```
stats
```

**Xem tất cả slab classes:**
```
stats slabs
```

**Xem items trong slab:**
```
stats items
```

**Thoát:**
```
quit
```

### 2. Sử dụng memcached-tool (nếu đã cài đặt)

```bash
memcached-tool localhost:11211 stats
```

### 3. Sử dụng API endpoint của backend

Cách đơn giản nhất là sử dụng endpoint đã tạo:

```bash
# Kiểm tra một key
curl http://localhost:8080/memcached/get/user:1

# Kiểm tra nhiều keys
curl -X POST http://localhost:8080/memcached/get-multi \
  -H 'Content-Type: application/json' \
  -d '{"keys":["user:1","user:2"]}'

# Xem stats
curl http://localhost:8080/memcached/stats
```

## So sánh Memcached vs Redis

| Tính năng           | Memcached                    | Redis                          |
| ------------------- | ---------------------------- | ------------------------------ |
| Cấu trúc dữ liệu    | Chỉ key-value đơn giản       | String, Hash, List, Set, ZSet  |
| Persistence         | Không                        | Có (RDB, AOF)                  |
| Replication         | Không                        | Có (Master-Slave)              |
| Đa luồng            | Có (multi-threaded)          | Không (single-threaded)        |
| Memory eviction     | LRU                          | Nhiều thuật toán               |
| Use case            | Cache đơn giản, phân tán     | Cache phức tạp, pub/sub, queue |
| Performance         | Rất nhanh với dữ liệu đơn giản | Nhanh, linh hoạt hơn          |

## Best Practices

### 1. Đặt tên key có cấu trúc

```typescript
// Tốt - dễ quản lý và tìm kiếm
await memcachedService.set('user:profile:1', userData, 3600);
await memcachedService.set('product:details:123', productData, 7200);
await memcachedService.set('session:abc123', sessionData, 1800);

// Không tốt - khó quản lý
await memcachedService.set('u1', userData, 3600);
await memcachedService.set('prod_123', productData, 7200);
```

### 2. Thiết lập TTL hợp lý

```typescript
// Cache session: 30 phút
await memcachedService.set('session:user123', sessionData, 1800);

// Cache dữ liệu ít thay đổi: 1 giờ
await memcachedService.set('user:profile:1', userData, 3600);

// Cache dữ liệu thường xuyên thay đổi: 5 phút
await memcachedService.set('product:stock:123', stockData, 300);
```

### 3. Xử lý cache miss

```typescript
async getUserProfile(userId: number) {
  const cacheKey = `user:profile:${userId}`;
  
  // Thử lấy từ cache
  let user = await this.memcachedService.get<User>(cacheKey);
  
  if (!user) {
    // Cache miss - lấy từ database
    user = await this.userRepository.findOne(userId);
    
    if (user) {
      // Lưu vào cache cho lần sau
      await this.memcachedService.set(cacheKey, user, 3600);
    }
  }
  
  return user;
}
```

### 4. Sử dụng getMulti cho hiệu suất cao

```typescript
// Tốt - 1 request
const users = await this.memcachedService.getMulti<User>([
  'user:profile:1',
  'user:profile:2',
  'user:profile:3',
]);

// Không tốt - 3 requests
const user1 = await this.memcachedService.get('user:profile:1');
const user2 = await this.memcachedService.get('user:profile:2');
const user3 = await this.memcachedService.get('user:profile:3');
```

### 5. Invalidate cache khi cập nhật

```typescript
async updateUser(userId: number, updateData: UpdateUserDto) {
  // Cập nhật database
  const user = await this.userRepository.update(userId, updateData);
  
  // Xóa cache cũ
  await this.memcachedService.delete(`user:profile:${userId}`);
  
  // Hoặc cập nhật cache mới ngay
  await this.memcachedService.set(`user:profile:${userId}`, user, 3600);
  
  return user;
}
```

## Gợi ý mở rộng

- **Environment Configuration**: Di chuyển config Memcached vào `ConfigModule` để dễ quản lý nhiều môi trường (dev, staging, production).
- **Health Check**: Thêm endpoint health check để monitor trạng thái kết nối Memcached.
- **Retry Logic**: Cải thiện error handling và retry mechanism khi Memcached server gặp sự cố.
- **Metrics & Monitoring**: Tích hợp Prometheus hoặc logging để theo dõi cache hit/miss ratio.
- **Clustering**: Cấu hình multiple Memcached servers để tăng khả năng mở rộng và fault tolerance.
- **Cache Warming**: Implement strategy để pre-load dữ liệu quan trọng vào cache khi khởi động.
- **Testing**: Tạo unit test và e2e test cho các thao tác cache.

## Troubleshooting

### Connection refused

```bash
# Kiểm tra Memcached có đang chạy không
docker ps | grep memcached

# Kiểm tra port có mở không
telnet localhost 11211

# Restart container nếu cần
docker restart memcached
```

### Memory full (evictions cao)

```bash
# Kiểm tra memory usage
curl http://localhost:8080/memcached/stats

# Tăng memory limit khi chạy container
docker run -d --name memcached -p 11211:11211 memcached:latest -m 512
```

### Key không tồn tại sau khi set

- Kiểm tra TTL có hợp lý không (đơn vị là giây).
- Kiểm tra memory có đủ không (có thể bị evicted).
- Kiểm tra kết nối đến đúng Memcached instance không.
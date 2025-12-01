---
sidebar_position: 3
---
# Hazelcast

Hazelcast là một in-memory data grid mã nguồn mở cung cấp khả năng distributed caching, distributed computing và messaging. Tài liệu này hướng dẫn tích hợp Hazelcast trong backend NestJS của chúng ta.

## Tổng Quan

Tích hợp Hazelcast của chúng ta cung cấp:
- **Lưu Trữ Distributed Map**: Lưu trữ các cặp key-value trên nhiều nodes
- **Tính Sẵn Sàng Cao**: Tự động sao chép dữ liệu và chuyển đổi dự phòng
- **Khả Năng Mở Rộng Ngang**: Thêm nhiều nodes để tăng dung lượng
- **Hiệu Suất Nhanh**: Lưu trữ trong bộ nhớ với độ trễ microsecond
- **Hỗ Trợ TTL**: Tự động hết hạn dữ liệu được lưu cache

## Yêu Cầu Trước Khi Bắt Đầu

### 1. Cài Đặt Dependencies

```bash
npm install hazelcast-client
# hoặc
pnpm add hazelcast-client
```

### 2. Khởi Động Hazelcast Server

Sử dụng Docker Compose:

```bash
cd backend
docker compose up hazelcast -d
```

Lệnh này sẽ khởi động Hazelcast trên `localhost:5701`.

Hoặc sử dụng docker hub
```bash
docker run -p 5701:5701 hazelcast/hazelcast
```

### 3. Xác Minh Hazelcast Đang Chạy

```bash
docker ps | grep hazelcast
```

Bạn sẽ thấy container đang chạy:
```
CONTAINER ID   IMAGE                      STATUS         PORTS
abc123def456   hazelcast/hazelcast:5.3.0  Up 2 minutes   0.0.0.0:5701->5701/tcp
```

## Cấu Hình

### Cấu Hình Provider

Hazelcast client được cấu hình trong `hazelcast.provider.ts`:

```typescript
import { Client } from 'hazelcast-client';

export const HAZELCAST = 'HAZELCAST_CLIENT';

export const hazelcastProvider = {
  provide: HAZELCAST,
  useFactory: async () => {
    const client = await Client.newHazelcastClient({
      clusterName: 'dev',
      network: {
        clusterMembers: ['localhost:5701'],
      },
    });
    return client;
  },
};
```

**Các Tùy Chọn Cấu Hình:**
- `clusterName`: Tên của Hazelcast cluster (mặc định: `dev`)
- `clusterMembers`: Mảng các địa chỉ node Hazelcast
- Tùy chọn bổ sung: connection timeout, retry settings, cấu hình SSL/TLS

### Đăng Ký Module

Import `HazelcastModule` vào application module của bạn:

```typescript
import { Module } from '@nestjs/common';
import { HazelcastModule } from './cache/hazelcast/hazelcast.module';

@Module({
  imports: [HazelcastModule],
  // ...
})
export class AppModule {}
```

## REST API Endpoints

Backend cung cấp các HTTP endpoints sau để kiểm thử và tích hợp:

### Đặt Giá Trị

**Endpoint:** `POST /hazelcast/:mapName/:key`

**Request Body:**
```json
{
  "value": "your-data-here",
  "ttl": 60000
}
```

**Ví dụ:**
```bash
curl -X POST http://localhost:3000/hazelcast/users/user:123 \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "John Doe", "age": 30}}'
```

**Response:**
```json
{
  "message": "Successfully set key 'user:123' in map 'users'",
  "ttl": "no expiration"
}
```

### Lấy Giá Trị

**Endpoint:** `GET /hazelcast/:mapName/:key`

**Ví dụ:**
```bash
curl http://localhost:3000/hazelcast/users/user:123
```

**Response:**
```json
{
  "mapName": "users",
  "key": "user:123",
  "value": {
    "name": "John Doe",
    "age": 30
  }
}
```

### Xóa Một Key

**Endpoint:** `DELETE /hazelcast/:mapName/:key`

**Ví dụ:**
```bash
curl -X DELETE http://localhost:3000/hazelcast/users/user:123
```

**Response:**
```json
{
  "message": "Successfully deleted key 'user:123' from map 'users'"
}
```

### Kiểm Tra Key Có Tồn Tại

**Endpoint:** `GET /hazelcast/:mapName/:key/exists`

**Ví dụ:**
```bash
curl http://localhost:3000/hazelcast/users/user:123/exists
```

**Response:**
```json
{
  "mapName": "users",
  "key": "user:123",
  "exists": true
}
```

### Lấy Tất Cả Entries

**Endpoint:** `GET /hazelcast/:mapName/entries`

**Ví dụ:**
```bash
curl http://localhost:3000/hazelcast/users/entries
```

**Response:**
```json
{
  "mapName": "users",
  "count": 2,
  "entries": [
    {"key": "user:1", "value": {"name": "Alice"}},
    {"key": "user:2", "value": {"name": "Bob"}}
  ]
}
```

### Lấy Tất Cả Keys

**Endpoint:** `GET /hazelcast/:mapName/keys`

**Ví dụ:**
```bash
curl http://localhost:3000/hazelcast/users/keys
```

**Response:**
```json
{
  "mapName": "users",
  "count": 2,
  "keys": ["user:1", "user:2"]
}
```

### Lấy Tất Cả Values

**Endpoint:** `GET /hazelcast/:mapName/values`

**Ví dụ:**
```bash
curl http://localhost:3000/hazelcast/users/values
```

**Response:**
```json
{
  "mapName": "users",
  "count": 2,
  "values": [
    {"name": "Alice"},
    {"name": "Bob"}
  ]
}
```

### Lấy Kích Thước Map

**Endpoint:** `GET /hazelcast/:mapName/size`

**Ví dụ:**
```bash
curl http://localhost:3000/hazelcast/users/size
```

**Response:**
```json
{
  "mapName": "users",
  "size": 2
}
```

### Xóa Tất Cả Entries

**Endpoint:** `DELETE /hazelcast/:mapName/clear`

**Ví dụ:**
```bash
curl -X DELETE http://localhost:3000/hazelcast/users/clear
```

**Response:**
```json
{
  "message": "Successfully cleared map 'users'"
}
```

### Put If Absent (Đặt Nếu Chưa Có)

**Endpoint:** `POST /hazelcast/:mapName/:key/if-absent`

**Request Body:**
```json
{
  "value": "your-data-here",
  "ttl": 60000
}
```

**Ví dụ:**
```bash
curl -X POST http://localhost:3000/hazelcast/users/user:123/if-absent \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "Jane Doe"}}'
```

**Response (key không tồn tại):**
```json
{
  "message": "Successfully set key 'user:123' in map 'users'",
  "previousValue": null
}
```

**Response (key đã tồn tại):**
```json
{
  "message": "Key 'user:123' already exists in map 'users'",
  "previousValue": {"name": "John Doe"}
}
```

### Lấy Nhiều Giá Trị

**Endpoint:** `GET /hazelcast/:mapName/multiple?keys=key1,key2,key3`

**Ví dụ:**
```bash
curl "http://localhost:3000/hazelcast/users/multiple?keys=user:1,user:2,user:3"
```

**Response:**
```json
{
  "mapName": "users",
  "requested": 3,
  "found": 2,
  "values": {
    "user:1": {"name": "Alice"},
    "user:2": {"name": "Bob"}
  }
}
```

## Hướng Dẫn Kiểm Thử

### Kiểm Thử Thủ Công Với cURL

#### 1. Khởi Động Backend Server

```bash
cd backend
npm run start:dev
# or
pnpm run start:dev
```

#### 2. Kiểm Thử Các Thao Tác Cơ Bản

**Đặt một user:**
```bash
curl -X POST http://localhost:3000/hazelcast/users/user:1 \
  -H "Content-Type: application/json" \
  -d '{"value": {"id": 1, "name": "Alice", "email": "alice@example.com"}}'
```

**Lấy user:**
```bash
curl http://localhost:3000/hazelcast/users/user:1
```

**Kiểm tra user có tồn tại:**
```bash
curl http://localhost:3000/hazelcast/users/user:1/exists
```

**Xóa user:**
```bash
curl -X DELETE http://localhost:3000/hazelcast/users/user:1
```

#### 3. Kiểm Thử TTL (Time-to-Live)

**Đặt giá trị với TTL 10 giây:**
```bash
curl -X POST http://localhost:3000/hazelcast/sessions/session:abc \
  -H "Content-Type: application/json" \
  -d '{"value": {"userId": 123, "token": "xyz"}, "ttl": 10000}'
```

**Lấy giá trị ngay lập tức:**
```bash
curl http://localhost:3000/hazelcast/sessions/session:abc
```

**Chờ 11 giây, sau đó thử lấy lại:**
```bash
sleep 11
curl http://localhost:3000/hazelcast/sessions/session:abc
# Nên trả về: {"mapName":"sessions","key":"session:abc","value":null}
```

#### 4. Kiểm Thử Các Thao Tác Hàng Loạt

**Thêm nhiều users:**
```bash
curl -X POST http://localhost:3000/hazelcast/users/user:1 \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "Alice"}}'

curl -X POST http://localhost:3000/hazelcast/users/user:2 \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "Bob"}}'

curl -X POST http://localhost:3000/hazelcast/users/user:3 \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "Charlie"}}'
```

**Lấy tất cả entries:**
```bash
curl http://localhost:3000/hazelcast/users/entries
```

**Lấy các users cụ thể:**
```bash
curl "http://localhost:3000/hazelcast/users/multiple?keys=user:1,user:2"
```

**Lấy kích thước map:**
```bash
curl http://localhost:3000/hazelcast/users/size
```

**Xóa tất cả:**
```bash
curl -X DELETE http://localhost:3000/hazelcast/users/clear
```

#### 5. Kiểm Thử Put If Absent

**Lần thử đầu tiên (nên thành công):**
```bash
curl -X POST http://localhost:3000/hazelcast/config/app:theme/if-absent \
  -H "Content-Type: application/json" \
  -d '{"value": "dark"}'
# Response: "Successfully set key..."
```

**Lần thử thứ hai (nên thất bại):**
```bash
curl -X POST http://localhost:3000/hazelcast/config/app:theme/if-absent \
  -H "Content-Type: application/json" \
  -d '{"value": "light"}'
# Response: "Key 'app:theme' already exists..."
```
## Đặc Điểm Hiệu Suất

### Độ Trễ

- **Set Operation**: 1-5 ms
- **Get Operation**: < 1 ms
- **Delete Operation**: 1-3 ms
- **Batch Operations**: 5-20 ms (depending on size)

### Throughput (Lưu Lượng)

- **Single Node**: ~50,000 ops/sec
- **3-Node Cluster**: ~150,000 ops/sec (mở rộng tuyến tính)

### Bộ Nhớ

Mỗi map entry tiêu thụ:
- Key overhead: ~40 bytes
- Value: phụ thuộc vào kích thước dữ liệu
- Metadata: ~32 bytes

## Best Practices

### 1. Quy Ước Đặt Tên Map

Sử dụng tên map mô tả, có namespace:

```typescript
// Tốt
await hazelcastService.set('user:profiles', 'user:123', userData);
await hazelcastService.set('session:tokens', 'token:abc', sessionData);

// Tránh
await hazelcastService.set('data', '123', userData);
```

### 2. Sử Dụng TTL Cho Dữ Liệu Tạm Thời

Luôn đặt TTL cho session data, tokens, và temporary caches:

```typescript
// Session hết hạn sau 1 giờ
await hazelcastService.set('sessions', sessionId, sessionData, 3600000);

// Mã xác minh hết hạn sau 5 phút
await hazelcastService.set('verification', code, data, 300000);
```

### 3. Xử Lý Lỗi

Luôn bao bọc các thao tác Hazelcast trong try-catch blocks:

```typescript
try {
  const user = await hazelcastService.get('users', userId);
  if (!user) {
    // Xử lý cache miss
    const userFromDB = await fetchUserFromDatabase(userId);
    await hazelcastService.set('users', userId, userFromDB, 3600000);
    return userFromDB;
  }
  return user;
} catch (error) {
  logger.error('Hazelcast error:', error);
  // Fallback về database
  return await fetchUserFromDatabase(userId);
}
```

### 4. Sử Dụng Các Thao Tác Hàng Loạt

Khi lấy nhiều keys, sử dụng `getMultiple` thay vì nhiều lần gọi `get`:

```typescript
// Tốt
const users = await hazelcastService.getMultiple('users', ['user:1', 'user:2', 'user:3']);

// Tránh
const user1 = await hazelcastService.get('users', 'user:1');
const user2 = await hazelcastService.get('users', 'user:2');
const user3 = await hazelcastService.get('users', 'user:3');
```

### 5. Dọn Dẹp Định Kỳ

Với các map không có TTL, triển khai dọn dẹp định kỳ:

```typescript
// Dọn dẹp các entries cũ mỗi ngày một lần
@Cron('0 0 * * *')
async cleanupOldCaches() {
  await this.hazelcastService.clear('temp:data');
}
```

## Migration Từ Redis/Memcached

Nếu bạn đang migration từ Redis hoặc Memcached:

### Từ Redis:
```typescript
// Redis
await redis.set('user:123', JSON.stringify(user), 'EX', 3600);
const data = await redis.get('user:123');
const user = JSON.parse(data);

// Hazelcast (không cần JSON serialization)
await hazelcast.set('users', 'user:123', user, 3600000);
const user = await hazelcast.get('users', 'user:123');
```

### Từ Memcached:
```typescript
// Memcached
await memcached.set('user:123', user, 3600);
const user = await memcached.get('user:123');

// Hazelcast (TTL tính bằng milliseconds thay vì seconds)
await hazelcast.set('users', 'user:123', user, 3600000);
const user = await hazelcast.get('users', 'user:123');
```

## Tài Nguyên Bổ Sung

- [Tài Liệu Chính Thức Hazelcast](https://docs.hazelcast.com/)
- [Hazelcast Node.js Client](https://github.com/hazelcast/hazelcast-nodejs-client)
- [Hazelcast Cloud](https://cloud.hazelcast.com/)
- [Hướng Dẫn Best Practices](https://docs.hazelcast.com/hazelcast/latest/performance)


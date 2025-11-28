# Cache Invalidation

Cache invalidation là một trong những khía cạnh quan trọng nhất khi triển khai hệ thống distributed cache. Tài liệu này hướng dẫn cách cache invalidation được triển khai trong backend của chúng ta sử dụng decorators và interceptors của NestJS.

## Tổng Quan

Triển khai cache invalidation của chúng ta cung cấp:

- **Tự Động Vô Hiệu Hóa Cache**: Các phương thức được đánh dấu bằng `@CacheInvalidation` tự động xóa các mục cache sau khi thực thi
- **Tự Động Lưu Cache**: Các phương thức được đánh dấu bằng `@Cacheable` tự động lưu kết quả vào cache
- **Cache Keys Động**: Hỗ trợ cache keys dựa trên tham số (ví dụ: `users:id:5`)
- **Vô Hiệu Hóa Nhiều Cache**: Có thể xếp chồng nhiều decorators `@CacheInvalidation` trên một phương thức
- **In-Memory hoặc Redis**: Hoạt động với cả in-memory cache và Redis backend

## Kiến Trúc

### Các Thành Phần

1. **Decorators** (`src/cache/decorators/`)
   - `@Cacheable`: Đánh dấu phương thức để tự động lưu cache
   - `@CacheInvalidation`: Đánh dấu phương thức cần vô hiệu hóa cache

2. **Interceptors** (`src/cache/interceptors/`)
   - `CacheInterceptor`: Xử lý logic caching
   - `CacheInvalidationInterceptor`: Xử lý logic vô hiệu hóa cache

3. **Cache Keys** (`src/cache/decorators/cache.keys.ts`)
   - Các hằng số cache key tập trung

## Cấu Hình

### 1. Thiết Lập App Module

Cache được cấu hình toàn cục trong `app.module.ts`:

```typescript
import { CacheModule } from '@nestjs/cache-manager';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { CacheInterceptor } from './cache/interceptors/cache.interceptor';
import { CacheInvalidationInterceptor } from './cache/interceptors/cache-invalidation.interceptor';

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      ttl: 60000, // 60 seconds default TTL
    }),
  ],
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInvalidationInterceptor,
    },
  ],
})
export class AppModule {}
```

### 2. Định Nghĩa Cache Keys

Tạo các hằng số cache key tập trung:

```typescript
// src/cache/decorators/cache.keys.ts
export const USER_CACHE_KEYS = {
  GET_ALL_USERS: 'users:all',
  GET_USER_BY_ID: 'users:id',
};
```

## Ví Dụ Sử Dụng

### Caching Cơ Bản

Lưu cache kết quả của phương thức với `@Cacheable`:

```typescript
import { Cacheable } from '../../cache/decorators/index.js';
import { USER_CACHE_KEYS } from '../../cache/decorators/cache.keys.js';

@Injectable()
export class UserService {
  @Cacheable(USER_CACHE_KEYS.GET_ALL_USERS)
  async getAllUsers(): Promise<User[]> {
    // Kết quả sẽ được lưu cache với key 'users:all'
    return this.userRepository.findAll();
  }
}
```

### Cache Keys Động

Sử dụng tham số của phương thức trong cache keys:

```typescript
@Cacheable(USER_CACHE_KEYS.GET_USER_BY_ID, { key: 'id' })
async getUserById(id: number): Promise<User | undefined> {
  // Cache key sẽ trở thành 'users:id:5' khi gọi getUserById(5)
  return this.userRepository.findById(id);
}
```

### Vô Hiệu Hóa Cache Đơn Giản

Vô hiệu hóa cache khi dữ liệu thay đổi:

```typescript
@CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS)
async createUser(name: string, email: string): Promise<User> {
  // Sau khi tạo user, cache 'users:all' sẽ bị vô hiệu hóa
  const user = new User(Date.now(), name, email);
  return this.userRepository.create(user);
}
```

### Vô Hiệu Hóa Nhiều Cache

Vô hiệu hóa nhiều cache keys với một phương thức:

```typescript
@CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS)
@CacheInvalidation(USER_CACHE_KEYS.GET_USER_BY_ID, { key: 'id' })
async updateUser(id: number, user: Partial<User>): Promise<User | undefined> {
  // Vô hiệu hóa cả 'users:all' và 'users:id:5' (với id=5)
  return await this.userRepository.update(id, user);
}

@CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS)
@CacheInvalidation(USER_CACHE_KEYS.GET_USER_BY_ID, { key: 'id' })
async deleteUser(id: number): Promise<void> {
  // Vô hiệu hóa cả 'users:all' và 'users:id:5' (với id=5)
  return await this.userRepository.delete(id);
}
```

## Ví Dụ Hoàn Chỉnh: User Service

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { Cacheable, CacheInvalidation } from '../../cache/decorators/index.js';
import { USER_CACHE_KEYS } from '../../cache/decorators/cache.keys.js';
import { User } from '../domain/user.entity';
import type { UserRepository } from '../domain/user.repository';

@Injectable()
export class UserService {
  constructor(
    @Inject('UserRepository') private readonly userRepository: UserRepository,
  ) {}

  @Cacheable(USER_CACHE_KEYS.GET_ALL_USERS)
  async getAllUsers(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  @Cacheable(USER_CACHE_KEYS.GET_USER_BY_ID, { key: 'id' })
  async getUserById(id: number): Promise<User | undefined> {
    return this.userRepository.findById(id);
  }

  @CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS)
  async createUser(name: string, email: string): Promise<User> {
    const id = Date.now();
    const user = new User(id, name, email);
    return this.userRepository.create(user);
  }

  @CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS)
  @CacheInvalidation(USER_CACHE_KEYS.GET_USER_BY_ID, { key: 'id' })
  async updateUser(id: number, user: Partial<User>): Promise<User | undefined> {
    return await this.userRepository.update(id, user);
  }

  @CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS)
  @CacheInvalidation(USER_CACHE_KEYS.GET_USER_BY_ID, { key: 'id' })
  async deleteUser(id: number): Promise<void> {
    return await this.userRepository.delete(id);
  }
}
```

## Cách Hoạt Động

### Luồng Caching

1. Client gọi `getAllUsers()`
2. `CacheInterceptor` kiểm tra xem dữ liệu có tồn tại trong cache với key `users:all` không
3. Nếu **cache hit**: Trả về dữ liệu từ cache ngay lập tức
4. Nếu **cache miss**: Thực thi phương thức, lưu kết quả vào cache, trả về dữ liệu

### Luồng Vô Hiệu Hóa

1. Client gọi `createUser(name, email)`
2. Phương thức được thực thi và tạo user
3. `CacheInvalidationInterceptor` phát hiện `@CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS)`
4. Xóa mục cache với key `users:all`
5. Lần gọi `getAllUsers()` tiếp theo sẽ lấy dữ liệu mới

### Luồng Dynamic Key

1. Client gọi `getUserById(5)`
2. `CacheInterceptor` tạo dynamic key: `users:id` + `:5` = `users:id:5`
3. Kiểm tra cache cho `users:id:5`
4. Khi gọi `updateUser(5, {...})`, vô hiệu hóa `users:id:5`

## Kiểm Tra Cache Invalidation

### Sử Dụng cURL

```bash
# 1. Lấy tất cả users (cache miss - lấy từ DB)
curl http://localhost:8080/user/all
# Console: "Caching data for key: users:all"

# 2. Lấy tất cả users lần nữa (cache hit - trả về từ cache)
curl http://localhost:8080/user/all
# Console: "Returning cached data for key: users:all"

# 3. Tạo user mới (vô hiệu hóa cache)
curl -X POST http://localhost:8080/user \
  -H "Content-Type: application/json" \
  -d '{"name":"John Doe","email":"john@example.com"}'
# Console: "Cache key users:all invalidated."

# 4. Lấy tất cả users lại (cache miss - lấy dữ liệu mới)
curl http://localhost:8080/user/all
# Console: "Caching data for key: users:all"

# 5. Lấy user cụ thể (cache miss)
curl http://localhost:8080/user/1
# Console: "Caching data for key: users:id:1"

# 6. Cập nhật user (vô hiệu hóa cache của user cụ thể)
curl -X PATCH http://localhost:8080/user/1 \
  -H "Content-Type: application/json" \
  -d '{"name":"Jane Doe"}'
# Console: "Cache key users:all invalidated."
# Console: "Cache key users:id:1 invalidated."

# 7. Xóa user (vô hiệu hóa cả hai cache)
curl -X DELETE http://localhost:8080/user/1
# Console: "Cache key users:all invalidated."
# Console: "Cache key users:id:1 invalidated."
```

## Best Practices

### 1. Sử Dụng Cache Keys Mô Tả Rõ Ràng

```typescript
// Tốt
export const USER_CACHE_KEYS = {
  GET_ALL_USERS: 'users:all',
  GET_USER_BY_ID: 'users:id',
  GET_USER_BY_EMAIL: 'users:email',
};

// Tránh
export const KEYS = {
  K1: 'u1',
  K2: 'u2',
};
```

### 2. Vô Hiệu Hóa Các Cache Liên Quan

Khi cập nhật user, vô hiệu hóa cả list cache và detail cache:

```typescript
@CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS)      // List cache
@CacheInvalidation(USER_CACHE_KEYS.GET_USER_BY_ID, { key: 'id' })  // Detail cache
async updateUser(id: number, user: Partial<User>) {
  // ...
}
```

### 3. Đặt TTL Phù Hợp

```typescript
// TTL ngắn cho dữ liệu thay đổi thường xuyên
@Cacheable(USER_CACHE_KEYS.GET_ACTIVE_SESSIONS, { ttl: 5000 }) // 5 giây

// TTL dài cho dữ liệu ổn định
@Cacheable(CONFIG_KEYS.APP_SETTINGS, { ttl: 300000 }) // 5 phút
```

### 4. Xử Lý Lỗi Cache Một Cách Nhẹ Nhàng

Các interceptors sử dụng `void` cho các thao tác cache để ngăn lỗi ảnh hưởng đến logic chính:

```typescript
void this.cacheManager.set(cacheKey, data, ttl);
void this.cacheManager.del(cacheKey);
```

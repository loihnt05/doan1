# Authentication & Authorization - Demo và Triển Khai

Tài liệu mô tả các phần demo thực tế cho hệ thống xác thực và phân quyền.

## Công nghệ sử dụng

- **Backend Framework**: NestJS
- **Password Hashing**: bcrypt  
- **Token**: JWT (JSON Web Tokens)
- **Validation**: class-validator
- **Rate Limiting**: @nestjs/throttler
- **Database**: PostgreSQL + TypeORM
- **Cache**: Redis (cho token blacklist)

## Các Phần Demo

### Demo 1: Basic Authentication Flow

**Công nghệ**: JWT + bcrypt + TypeORM

**Cách triển khai**:
- Sử dụng TypeORM hook `@BeforeInsert()` để tự động hash password bằng bcrypt với 10 salt rounds trước khi lưu vào database
- AuthService verify password bằng bcrypt.compare(), nếu đúng thì generate JWT token chứa user ID
- Protected routes sử dụng JwtAuthGuard để verify token từ Authorization header
- Token được sign với secret key và có thời gian hết hạn (ví dụ 15 phút hoặc 1 giờ)

**Cách test**:
- Đăng ký user mới qua POST `/users` với username và password
- Login qua POST `/auth/login`, nhận về access_token trong response
- Sử dụng token để truy cập protected route như `/profile` bằng cách đặt trong Authorization header với format "Bearer <token>"
- Test các trường hợp lỗi: sai password (401 Unauthorized), token hết hạn (401), token không hợp lệ (401)

---

### Demo 2: Role-Based Access Control (RBAC)

**Công nghệ**: NestJS Guards + Reflector + Custom Decorators

**Cách triển khai**:
- Tạo custom decorator `@Roles()` sử dụng SetMetadata để đánh dấu roles yêu cầu cho endpoint
- RolesGuard sử dụng Reflector để đọc metadata roles từ decorator, sau đó so sánh với roles của user trong request
- User entity có field roles (array) lưu các vai trò như 'admin', 'moderator', 'user'
- Kết hợp JwtAuthGuard (verify token trước) và RolesGuard (check roles sau) trên các protected endpoints
- Guard trả về true nếu user có ít nhất một trong các roles yêu cầu

**Cách test**:
- Tạo users với roles khác nhau: admin user, moderator user, regular user
- Login với từng user để lấy token tương ứng
- Thử truy cập admin endpoint với admin token → thành công (200 OK)
- Thử truy cập admin endpoint với user token → bị từ chối (403 Forbidden)
- Verify rằng moderator chỉ truy cập được moderator endpoints, không được phép vào admin endpoints

---

### Demo 3: Permission-Based Authorization

**Công nghệ**: Custom Permission Guard với granular access control

**Cách triển khai**:
- Define permissions theo format `resource:action` như 'posts:create', 'posts:read', 'users:update', 'users:delete'
- Tạo decorator `@RequirePermissions()` để đánh dấu permissions cần thiết cho endpoint
- PermissionsGuard kiểm tra xem user có đủ tất cả permissions yêu cầu hay không (check bằng array.every())
- User entity có field permissions (array) lưu danh sách permissions được cấp cho user đó
- Linh hoạt hơn RBAC vì có thể tạo các tổ hợp permissions tùy ý không bị ràng buộc vào role cố định

**Cách test**:
- Tạo user 'reader' chỉ có permissions đọc: ['posts:read', 'users:read']
- Tạo user 'editor' có full permissions: ['posts:create', 'posts:read', 'posts:update', 'posts:delete']
- Reader thử tạo post qua POST `/posts` → 403 Forbidden (thiếu 'posts:create')
- Editor tạo post qua POST `/posts` → thành công (201 Created)
- Cả hai đều GET `/posts` thành công (cùng có 'posts:read')
- Reader thử update post → 403 (thiếu 'posts:update')

---

### Demo 4: Ownership-Based Authorization (ABAC)

**Công nghệ**: Custom Policy Guard kiểm tra resource ownership

**Cách triển khai**:
- OwnershipGuard load resource từ database dựa trên ID trong URL params
- So sánh authorId hoặc ownerId của resource với user.id trong request để xác định ownership
- Admin được bypass ownership check (có thể sửa/xóa mọi resource)
- Regular user chỉ được phép thao tác (update/delete) trên resource của chính mình
- Guard này chạy sau JwtAuthGuard nên đảm bảo đã có thông tin user authenticated
- Có thể cache metadata của resource để giảm database queries

**Cách test**:
- User A tạo một post qua POST `/posts` → post được lưu với authorId = A.id
- User A update post của mình qua PUT `/posts/1` → thành công (là owner)
- User B thử update post của A qua PUT `/posts/1` → 403 Forbidden (không phải owner)
- Admin thử update post của A qua PUT `/posts/1` → thành công (admin bypass ownership check)
- Test tương tự với delete endpoint và các resource khác như comments, files

---

### Demo 5: Rate Limiting

**Công nghệ**: @nestjs/throttler

**Cách triển khai**:
- ThrottlerModule config global rate limit mặc định: 10 requests per 60 seconds
- ThrottlerGuard register như global guard để áp dụng cho tất cả endpoints
- Override global limit bằng decorator `@Throttle(limit, ttl)` cho từng endpoint cụ thể
- Login endpoint: giới hạn 5 attempts/minute để chống brute-force attacks
- Register endpoint: giới hạn 3 registrations/hour để chống spam accounts tạo hàng loạt
- Throttler tự động track requests theo IP address và trả về 429 Too Many Requests khi vượt limit

**Cách test**:
- Thử login sai password liên tiếp 6 lần trong vòng 1 phút
- 5 lần đầu nhận 401 Unauthorized (wrong password but not rate limited)
- Lần thứ 6 nhận 429 Too Many Requests (rate limit reached)
- Đợi 1 phút để TTL reset, có thể thử lại
- Test registration tương tự: sau 3 lần đăng ký trong 1 giờ sẽ bị block
- Check response headers để thấy X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset

---

### Demo 6: Refresh Token Flow

**Công nghệ**: JWT + httpOnly Cookie

**Cách triển khai**:
- Khi login thành công, tạo 2 loại tokens: access_token (thời hạn ngắn 15 phút) và refresh_token (thời hạn dài 7 ngày)
- Access token trả về trong response body để client lưu trong memory hoặc sessionStorage
- Refresh token lưu trong httpOnly cookie với flags secure, sameSite=strict để chống XSS attacks
- Refresh token được sign bằng secret key riêng khác với access token
- Endpoint `/auth/refresh` đọc refresh token từ cookie, verify và issue access token mới
- Client tự động gửi cookie trong mọi request đến cùng domain (không cần thao tác thủ công)

**Cách test**:
- Login với curl option `-c cookies.txt` để lưu cookie vào file
- Sử dụng access token để truy cập API trong 15 phút đầu → thành công
- Sau 15 phút, access token hết hạn, gọi API nhận 401 Token Expired
- POST `/auth/refresh` với option `-b cookies.txt` để gửi refresh token từ cookie
- Nhận access token mới trong response, tiếp tục sử dụng
- Không cần phải login lại trong suốt 7 ngày (hoặc cho đến khi logout)

---

### Demo 7: Token Blacklist (Logout)

**Công nghệ**: Redis cho token revocation

**Cách triển khai**:
- Sử dụng Redis để lưu danh sách các token bị revoke (blacklist)
- Khi user logout, lưu token vào Redis với key pattern `blacklist:${token}` và TTL bằng thời gian còn lại đến khi token hết hạn
- JwtAuthGuard kiểm tra xem token có trong blacklist không trước khi cho phép truy cập
- Nếu token nằm trong blacklist, throw UnauthorizedException với message "Token revoked"
- Token tự động bị xóa khỏi Redis sau khi hết hạn (nhờ TTL) nên không tốn storage lâu dài
- Có thể mở rộng để revoke tất cả tokens của một user khi có security breach (multi-device logout)

**Cách test**:
- Login để lấy access token và lưu vào biến
- Sử dụng token để truy cập API như `/profile` → thành công
- POST `/auth/logout` với token trong Authorization header
- Thử dùng lại token đó để truy cập `/profile` → nhận 401 với message "Token revoked"
- Token không thể sử dụng lại dù chưa đến thời điểm hết hạn
- Check Redis bằng command `redis-cli GET blacklist:<token>` để thấy token được lưu với TTL còn lại

---

## Setup và Chạy Demo

**Dependencies cần cài đặt**:
```
pnpm install @nestjs/jwt @nestjs/passport passport passport-jwt
pnpm install bcrypt @types/bcrypt
pnpm install class-validator class-transformer
pnpm install @nestjs/throttler
pnpm install @nestjs-modules/ioredis ioredis
pnpm install typeorm @nestjs/typeorm pg
```

**Services cần chạy**:
- PostgreSQL database (port 5432)
- Redis server (port 6379)

**Environment variables cần thiết**:
- `JWT_SECRET`: Secret key cho access token
- `JWT_REFRESH_SECRET`: Secret key riêng cho refresh token
- `JWT_EXPIRATION`: Thời gian hết hạn access token (15m)
- `JWT_REFRESH_EXPIRATION`: Thời gian hết hạn refresh token (7d)
- `DATABASE_URL`: Connection string PostgreSQL
- `REDIS_URL`: Connection string Redis
- `NODE_ENV`: development hoặc production

**Khởi động ứng dụng**:
```bash
# Start database và Redis
docker-compose up -d

# Copy environment variables
cp .env.example .env

# Run migrations
pnpm run migration:run

# Start development server
pnpm run start:dev
```

**Test scripts có sẵn** (trong thư mục backend/):
- `test-auth-flow.sh`: Test toàn bộ authentication flow
- `test-rbac.sh`: Test role-based access control
- `test-permissions.sh`: Test permission-based authorization
- `test-ownership.sh`: Test ownership checks
- `test-rate-limiting.sh`: Test rate limiting với multiple requests

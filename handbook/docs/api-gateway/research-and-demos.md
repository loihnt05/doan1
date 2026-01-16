# Research và Demos về API Gateway

## Tổng quan

Các demo về API Gateway bao gồm các pattern như routing, rate limiting, circuit breaker, caching, authentication, và request aggregation.

## Công nghệ sử dụng

- **NestJS Express**: Framework chính để build API Gateway
- **@nestjs/throttler**: Rate limiting
- **opossum**: Circuit breaker implementation
- **Redis/cache-manager**: Caching layer
- **@nestjs/jwt**: JWT authentication
- **Passport**: Authentication middleware
- **axios/http**: Service-to-service communication

## Các Demo

### Demo 1: Basic Routing và Service Aggregation

**Công nghệ:** NestJS Controllers, HttpService, axios

**Cách triển khai:**
- Tạo một cổng chính nhận tất cả yêu cầu từ client
- Khi có yêu cầu đến, gateway sẽ xem đường dẫn (path) để biết phải gửi đến service nào
- Ví dụ: yêu cầu `/api/users` → gửi đến user-service, `/api/orders` → gửi đến order-service
- Gateway cũng có thể gọi nhiều service cùng lúc rồi gộp kết quả lại trước khi trả về cho client
- Giống như một nhân viên lễ tân, nhận yêu cầu rồi chuyển đến đúng phòng ban xử lý

**Cách test:**
```bash
# Test routing
curl http://localhost:3000/api/users
curl http://localhost:3000/api/orders

# Test aggregation - lấy thông tin từ nhiều services
curl http://localhost:3000/api/dashboard
```

### Demo 2: Rate Limiting - Fixed Window

**Công nghệ:** @nestjs/throttler, Redis

**Cách triển khai:**
- Chia thời gian thành các khung cố định (ví dụ mỗi khung 1 phút)
- Trong mỗi khung thời gian, mỗi người dùng chỉ được gọi API tối đa một số lần nhất định
- Lưu số lần đã gọi trong Redis với key là userId + thời gian khung hiện tại
- Khi hết khung thời gian, bộ đếm reset về 0
- Giống như giới hạn chỉ được rút tiền ATM 5 lần mỗi giờ, sau mỗi giờ lại được rút 5 lần mới

**Cách test:**
```bash
# Gọi API 10 lần liên tục
for i in {1..10}; do
  curl http://localhost:3000/api/limited
  echo ""
done
# Sau vài lần sẽ nhận được lỗi "Too Many Requests"
```

### Demo 3: Rate Limiting - Token Bucket

**Công nghệ:** Custom implementation, Redis

**Cách triển khai:**
- Tưởng tượng mỗi user có một cái túi chứa token (vé)
- Mỗi lần gọi API tốn 1 token, hết token thì không gọi được nữa
- Token được nạp lại đều đặn theo thời gian (ví dụ 10 token/giây)
- Túi có số token tối đa (capacity), không nạp vượt quá
- Lưu số token hiện tại và thời gian cập nhật cuối trong Redis
- Ưu điểm: Cho phép có burst traffic nhưng vẫn kiểm soát được tốc độ trung bình

**Cách test:**
```bash
# Test burst traffic
curl http://localhost:3000/api/token-bucket -w "\nStatus: %{http_code}\n"

# Chờ vài giây để token refill
sleep 3

# Test lại
curl http://localhost:3000/api/token-bucket -w "\nStatus: %{http_code}\n"
```

### Demo 4: Circuit Breaker Pattern

**Công nghệ:** opossum library

**Cách triển khai:**
- Giám sát các lời gọi đến service bên ngoài (ví dụ payment-service)
- Có 3 trạng thái: CLOSED (hoạt động bình thường), OPEN (dừng gọi), HALF-OPEN (thử lại)
- Khi có quá nhiều lỗi (ví dụ 5 lần liên tiếp), chuyển sang OPEN - ngừng gọi service và trả lỗi ngay
- Sau một khoảng thời gian, chuyển sang HALF-OPEN - cho phép thử lại vài request
- Nếu thành công thì quay về CLOSED, nếu vẫn lỗi thì về OPEN
- Giống như cầu dao tự động, khi có sự cố điện (service lỗi) thì tự động ngắt để bảo vệ, sau đó thử bật lại

**Cách test:**
```bash
# Gọi service đang hoạt động tốt
curl http://localhost:3000/api/payment/process

# Tắt payment-service để nó lỗi
docker stop payment-service

# Gọi lại nhiều lần để circuit breaker OPEN
for i in {1..6}; do
  curl http://localhost:3000/api/payment/process
done

# Bật lại service và chờ, circuit breaker sẽ tự HALF-OPEN rồi CLOSED
docker start payment-service
```

### Demo 5: Multi-layer Caching

**Công nghệ:** cache-manager, Redis, In-memory Map/LRU

**Cách triển khai:**
- Tạo 3 tầng cache: Memory (nhanh nhất), Redis (chia sẻ giữa các servers), Database (nguồn gốc)
- Khi có yêu cầu, tìm theo thứ tự: Memory → Redis → Database
- Tìm thấy ở đâu thì lưu vào các tầng phía trên (cache warm-up)
- Mỗi tầng có thời gian hết hạn khác nhau (TTL)
- Memory: TTL ngắn (30s), dung lượng nhỏ, cực nhanh
- Redis: TTL trung bình (5 phút), dung lượng lớn hơn, chia sẻ được
- Database: Dữ liệu gốc, không có TTL
- Giống như tìm tài liệu: Kiểm tra bàn làm việc → tủ văn phòng → kho lưu trữ

**Cách test:**
```bash
# Lần đầu - chậm (query database)
time curl http://localhost:3000/api/products/123

# Lần 2 - nhanh (từ cache)
time curl http://localhost:3000/api/products/123

# Xóa cache và test lại
curl -X DELETE http://localhost:3000/api/cache/products/123
time curl http://localhost:3000/api/products/123
```

### Demo 6: Authentication với JWT Guard

**Công nghệ:** @nestjs/jwt, passport-jwt, JwtAuthGuard

**Cách triển khai:**
- Khi user login, tạo một chuỗi mã hóa (JWT token) chứa thông tin user (id, email, roles)
- Token này có chữ ký bí mật, không ai sửa được
- User gửi token này trong header mỗi khi gọi API
- Gateway dùng JwtAuthGuard để kiểm tra: token có hợp lệ không, còn hạn không, chữ ký đúng không
- Nếu hợp lệ thì cho phép truy cập, không hợp lệ thì từ chối
- Giống như thẻ ra vào công ty, có thẻ hợp lệ mới vào được

**Cách test:**
```bash
# Login để lấy token
TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"password"}' | jq -r '.access_token')

# Dùng token để gọi API protected
curl http://localhost:3000/api/protected \
  -H "Authorization: Bearer $TOKEN"

# Gọi không có token → bị từ chối
curl http://localhost:3000/api/protected
```

### Demo 7: Role-based Authorization

**Công nghệ:** @nestjs/common (Roles decorator), RolesGuard

**Cách triển khai:**
- Mỗi user có các vai trò (roles) như admin, user, moderator
- Mỗi endpoint API có thể yêu cầu role cụ thể (ví dụ: chỉ admin mới xóa user)
- Tạo decorator @Roles('admin') để đánh dấu endpoint cần role gì
- Tạo RolesGuard để kiểm tra: user hiện tại có role phù hợp không
- Lấy roles từ JWT token (được gắn khi login) so sánh với roles yêu cầu
- Giống như phân quyền trong công ty: nhân viên thường chỉ xem, quản lý được sửa, giám đốc được xóa

**Cách test:**
```bash
# Login với admin account
ADMIN_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"admin123"}' | jq -r '.access_token')

# Login với user thường
USER_TOKEN=$(curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"user123"}' | jq -r '.access_token')

# Admin có thể xóa
curl -X DELETE http://localhost:3000/api/users/123 \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# User thường không xóa được
curl -X DELETE http://localhost:3000/api/users/123 \
  -H "Authorization: Bearer $USER_TOKEN"
```

### Demo 8: Request/Response Caching với ETags

**Công nghệ:** Express middleware, crypto (hash)

**Cách triển khai:**
- Khi trả response, tính một mã hash (ETag) từ nội dung response
- Gửi ETag này trong header về cho client
- Lần sau client gọi lại, nó gửi kèm ETag cũ trong header If-None-Match
- Gateway so sánh: nếu dữ liệu không đổi (ETag giống nhau) thì trả 304 Not Modified (không gửi lại body)
- Client dùng lại dữ liệu cũ đã lưu
- Tiết kiệm bandwidth vì không gửi lại dữ liệu không thay đổi
- Giống như hỏi "Sách có bản mới không?" - Nếu không có thì không cần đọc lại

**Cách test:**
```bash
# Lần đầu - nhận full response và ETag
curl -i http://localhost:3000/api/products/123

# Copy ETag từ response header
# Lần 2 - gửi ETag, nhận 304 (không có body)
curl -i http://localhost:3000/api/products/123 \
  -H 'If-None-Match: "abc123hash"'
```

### Demo 9: Request Retry với Exponential Backoff

**Công nghệ:** axios-retry hoặc custom implementation

**Cách triển khai:**
- Khi gọi service khác mà bị lỗi tạm thời (network issue, service tạm quá tải), thử lại
- Không thử lại ngay mà chờ một chút, mỗi lần thất bại thì chờ lâu hơn (tăng gấp đôi)
- Ví dụ: thất bại lần 1 chờ 1s, lần 2 chờ 2s, lần 3 chờ 4s, lần 4 chờ 8s
- Giới hạn số lần thử tối đa (ví dụ 3-5 lần)
- Chỉ retry với các lỗi tạm thời (5xx, network timeout), không retry với lỗi client (4xx)
- Giống như gõ cửa, không ai mở thì chờ lâu hơn rồi gõ lại, không gõ liên tục làm phiền

**Cách test:**
```bash
# Service trả lỗi random
curl http://localhost:3000/api/retry-demo

# Xem log để thấy retry attempts
# Logs sẽ show: "Attempt 1 failed, retrying in 1s..."
#               "Attempt 2 failed, retrying in 2s..."
#               "Attempt 3 succeeded"
```

### Demo 10: Request Timeout và Fallback Response

**Công nghệ:** axios timeout config, try-catch

**Cách triển khai:**
- Đặt thời gian tối đa để chờ response từ service (timeout, ví dụ 3 giây)
- Nếu service không trả lời trong thời gian này, không chờ nữa mà trả về response dự phòng
- Response dự phòng có thể là: dữ liệu cũ từ cache, thông báo lỗi thân thiện, hoặc dữ liệu mặc định
- Ngăn client phải chờ quá lâu khi service chậm
- Tăng trải nghiệm người dùng vì luôn có response (dù không đầy đủ nhất)
- Giống như gọi điện, nếu không ai nghe máy sau 30 giây thì bỏ máy và làm việc khác

**Cách test:**
```bash
# Service phản hồi bình thường
curl http://localhost:3000/api/with-timeout

# Service chậm (giả lập delay 5s) → timeout sau 3s → fallback response
curl http://localhost:3000/api/with-timeout?delay=5000

# So sánh response: lần 1 có đầy đủ data, lần 2 là fallback data
```

## Cách chạy các demo

### 1. Cài đặt dependencies

```bash
cd backend
pnpm install
```

### 2. Start Redis (cho cache và rate limiting)

```bash
docker run -d -p 6379:6379 redis:latest
```

### 3. Start các services

```bash
# Start tất cả services
docker-compose up -d

# Hoặc chạy từng service riêng
pnpm run start:dev api-gateway
pnpm run start:dev user-service
pnpm run start:dev order-service
pnpm run start:dev payment-service
```

### 4. Test các endpoints

Mở terminal và chạy các lệnh curl trong từng demo ở trên.

### 5. Monitor logs

```bash
# Xem logs của API Gateway
docker logs -f api-gateway

# Xem logs của các services
docker logs -f user-service
docker logs -f order-service
```

### 6. Kiểm tra trạng thái

```bash
# Health check
curl http://localhost:3000/health

# Metrics (nếu có Prometheus)
curl http://localhost:3000/metrics
```

## Tài liệu tham khảo

- [NestJS Documentation](https://docs.nestjs.com/)
- [API Gateway Pattern - Microsoft](https://learn.microsoft.com/en-us/azure/architecture/microservices/design/gateway)
- [Circuit Breaker Pattern - Martin Fowler](https://martinfowler.com/bliki/CircuitBreaker.html)
- [Rate Limiting Strategies](https://cloud.google.com/architecture/rate-limiting-strategies-techniques)

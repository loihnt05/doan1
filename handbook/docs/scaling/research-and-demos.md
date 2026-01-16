# Research và Demos về Scaling

## Tổng quan

Các demo về scaling bao gồm horizontal scaling, vertical scaling, load balancing strategies, stateless vs stateful design, và auto-scaling patterns.

## Công nghệ sử dụng

- **Node.js Cluster Module**: Vertical scaling với multiple processes
- **Docker Compose**: Container orchestration và scaling
- **Nginx**: Load balancer với nhiều strategies
- **Redis**: Shared state store
- **Kubernetes HPA**: Horizontal Pod Autoscaler
- **PM2**: Process manager cho Node.js
- **Artillery/k6**: Load testing tools

## Các Demo

### Demo 1: Vertical Scaling với Node.js Cluster

**Công nghệ:** Node.js cluster module, os module

**Cách triển khai:**
- Thay vì chạy ứng dụng trên 1 process, dùng cluster module để tạo nhiều worker processes
- Mỗi worker chạy trên 1 CPU core khác nhau của máy
- Master process phân phối incoming requests cho các workers
- Khi 1 worker bị lỗi, master tự động tạo worker mới thay thế
- Tận dụng hết sức mạnh CPU của máy mà không cần thêm máy mới
- Giống như chia 1 công việc cho nhiều nhân viên trong cùng 1 phòng làm

**Cách test:**
```bash
# Chạy với 1 process (không cluster)
node dist/main.js

# Test CPU-intensive task - sẽ block event loop
curl http://localhost:3000/api/cpu-bound &
curl http://localhost:3000/api/users
# Request thứ 2 phải chờ request đầu xong (chậm)

# Chạy với cluster mode
node dist/cluster.js

# Test lại - các request đi vào workers khác nhau
curl http://localhost:3000/api/cpu-bound &
curl http://localhost:3000/api/users
# Request thứ 2 được xử lý ngay (nhanh)
```

### Demo 2: Horizontal Scaling với Docker Compose

**Công nghệ:** Docker Compose, Docker Swarm/Compose scale

**Cách triển khai:**
- Định nghĩa service trong docker-compose.yml với replicas (số bản sao)
- Docker tự động tạo nhiều containers chạy cùng code
- Mỗi container là 1 instance độc lập, có thể chạy trên máy khác nhau
- Load balancer (Nginx) đứng trước phân phối traffic đều cho các containers
- Dễ dàng tăng/giảm số instances bằng cách thay đổi replicas
- Giống như mở thêm chi nhánh cửa hàng để phục vụ nhiều khách hơn

**Cách test:**
```bash
# Scale lên 3 instances
docker-compose up --scale api-gateway=3 -d

# Kiểm tra có 3 containers
docker ps | grep api-gateway

# Load test để thấy requests được phân phối
for i in {1..10}; do
  curl http://localhost/api/health
  echo ""
done
# Xem logs, mỗi request được xử lý bởi instance khác nhau
```

### Demo 3: Load Balancing - Round Robin

**Công nghệ:** Nginx upstream module

**Cách triển khai:**
- Nginx giữ danh sách các backend servers (instances)
- Mỗi request đến, Nginx chọn server tiếp theo trong danh sách theo vòng tròn
- Request 1 → Server 1, Request 2 → Server 2, Request 3 → Server 3, Request 4 → Server 1 (lặp lại)
- Phân phối đều traffic cho tất cả servers
- Đơn giản nhưng không tính đến tình trạng hiện tại của server (đang bận hay rảnh)
- Giống như xếp hàng vào 3 quầy thu ngân theo thứ tự, không quan tâm quầy nào đang đông

**Cách test:**
```bash
# Cấu hình nginx với round-robin (mặc định)
# nginx.conf:
# upstream backend {
#   server api-1:3000;
#   server api-2:3000;
#   server api-3:3000;
# }

# Reload nginx
docker exec nginx nginx -s reload

# Gọi nhiều requests và xem phân phối
for i in {1..9}; do
  curl http://localhost/api/health
done

# Check logs: api-1, api-2, api-3 mỗi cái nhận 3 requests
docker logs api-1 | grep "GET /api/health" | wc -l  # 3
docker logs api-2 | grep "GET /api/health" | wc -l  # 3
docker logs api-3 | grep "GET /api/health" | wc -l  # 3
```

### Demo 4: Load Balancing - Least Connections

**Công nghệ:** Nginx least_conn directive

**Cách triển khai:**
- Nginx theo dõi số connections hiện tại đến mỗi server
- Khi có request mới, chọn server có ít connections nhất
- Phù hợp khi requests có thời gian xử lý khác nhau
- Server nào rảnh hơn (ít connections) sẽ nhận thêm việc
- Cân bằng tải thực sự tốt hơn round-robin
- Giống như vào quầy thu ngân nào ít người xếp hàng nhất

**Cách test:**
```bash
# Cấu hình nginx least_conn
# upstream backend {
#   least_conn;
#   server api-1:3000;
#   server api-2:3000;
#   server api-3:3000;
# }

docker exec nginx nginx -s reload

# Gọi requests, 1 số long-running
curl http://localhost/api/long-task &  # Giữ connection lâu
curl http://localhost/api/long-task &
curl http://localhost/api/fast-task   # Sẽ đi vào server rảnh

# Check logs: fast-task đi vào server không có long-task
```

### Demo 5: Load Balancing - IP Hash (Sticky Session)

**Công nghệ:** Nginx ip_hash directive

**Cách triển khai:**
- Nginx hash địa chỉ IP của client
- Cùng 1 IP luôn được route đến cùng 1 server (trừ khi server down)
- Hữu ích khi cần maintain session state trong server
- Client luôn nói chuyện với cùng 1 server, không bị mất session
- Nhược điểm: phân phối không đều nếu nhiều users từ cùng IP (công ty, proxy)
- Giống như khách quen luôn được phục vụ bởi cùng 1 nhân viên

**Cách test:**
```bash
# Cấu hình nginx ip_hash
# upstream backend {
#   ip_hash;
#   server api-1:3000;
#   server api-2:3000;
#   server api-3:3000;
# }

docker exec nginx nginx -s reload

# Gọi nhiều requests từ cùng IP
for i in {1..10}; do
  curl http://localhost/api/health
done

# Check logs: tất cả requests đi vào 1 server duy nhất
docker logs api-1 | grep "GET /api/health" | wc -l  # 10 hoặc 0
docker logs api-2 | grep "GET /api/health" | wc -l  # 10 hoặc 0
docker logs api-3 | grep "GET /api/health" | wc -l  # 10 hoặc 0
```

### Demo 6: Stateless Design với JWT

**Công nghệ:** JWT tokens, no server-side sessions

**Cách triển khai:**
- Không lưu session/state trong memory của server
- Khi user login, tạo JWT token chứa tất cả thông tin cần thiết
- Client gửi token này trong mỗi request
- Bất kỳ server nào nhận request đều decode được token và xác thực
- Không cần chia sẻ session giữa các servers
- Scale dễ dàng vì servers hoàn toàn độc lập
- Giống như vé xem phim, có vé là vào được, không cần check danh sách

**Cách test:**
```bash
# Login và lấy token
TOKEN=$(curl -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"123456"}' \
  | jq -r '.access_token')

# Gọi API protected với token - requests sẽ đi vào servers khác nhau
for i in {1..5}; do
  curl http://localhost/api/profile \
    -H "Authorization: Bearer $TOKEN"
  echo ""
done

# Check logs: tất cả servers đều xử lý được (không cần shared session)
docker logs api-1 | grep "/api/profile"
docker logs api-2 | grep "/api/profile"
docker logs api-3 | grep "/api/profile"
```

### Demo 7: Stateful Design với Redis Session Store

**Công nghệ:** Redis, express-session, connect-redis

**Cách triển khai:**
- Lưu session trong Redis (external store) thay vì memory
- Khi user login, tạo session ID và lưu data vào Redis
- Gửi session ID về client (trong cookie)
- Mỗi request, client gửi session ID, server lấy data từ Redis
- Tất cả servers đều truy cập cùng Redis nên thấy cùng session
- Có thể scale servers mà không mất session
- Giống như lưu hồ sơ trong tủ trung tâm, ai cũng xem được

**Cách test:**
```bash
# Đảm bảo Redis đang chạy
docker ps | grep redis

# Login và lưu session vào Redis
curl -c cookies.txt -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"user@test.com","password":"123456"}'

# Gọi API với session cookie
for i in {1..5}; do
  curl -b cookies.txt http://localhost/api/profile
  echo ""
done

# Check Redis: session được lưu
docker exec -it redis redis-cli
> KEYS sess:*
> GET sess:abc123...
```

### Demo 8: Auto-scaling với CPU Metrics

**Công nghệ:** Kubernetes HorizontalPodAutoscaler (HPA)

**Cách triển khai:**
- Kubernetes theo dõi CPU/Memory usage của pods
- Đặt ngưỡng (threshold), ví dụ: khi CPU > 70% thì scale up
- HPA tự động tăng số pods khi vượt ngưỡng
- Giảm số pods khi usage thấp để tiết kiệm tài nguyên
- Có min/max replicas để kiểm soát
- Scaling dựa trên metrics thực tế, không cần can thiệp thủ công
- Giống như điều hòa tự động bật tắt theo nhiệt độ

**Cách test:**
```bash
# Apply HPA config
kubectl apply -f k8s/hpa.yaml

# Xem current state
kubectl get hpa

# Tạo load để CPU tăng
kubectl run -it --rm load-generator --image=busybox -- /bin/sh
while true; do wget -q -O- http://api-gateway-service; done

# Theo dõi HPA tự động scale
watch kubectl get hpa
# Sẽ thấy: REPLICAS tăng từ 2 → 3 → 4...

# Dừng load, replicas tự giảm
```

### Demo 9: Database Read Replicas

**Công nghệ:** PostgreSQL replication, MySQL replication

**Cách triển khai:**
- Có 1 Primary database xử lý tất cả WRITE operations
- Có nhiều Replica databases đồng bộ dữ liệu từ Primary
- Tất cả READ operations đi vào Replicas
- Phân tải reads ra nhiều servers, Primary không bị quá tải
- Writes vẫn đi vào Primary để đảm bảo consistency
- Cần xử lý replication lag (độ trễ đồng bộ)
- Giống như có 1 người ghi sổ chính, nhiều người photo để cho mượn đọc

**Cách test:**
```bash
# Cấu hình connection pools
# primary: write operations
# replica: read operations

# Write data
curl -X POST http://localhost/api/users \
  -H "Content-Type: application/json" \
  -d '{"name":"John","email":"john@test.com"}'
# Ghi vào PRIMARY

# Read data
curl http://localhost/api/users
# Đọc từ REPLICA

# Check database logs
docker logs postgres-primary | grep INSERT  # Có
docker logs postgres-replica | grep INSERT  # Không có
docker logs postgres-replica | grep SELECT  # Có
```

### Demo 10: Graceful Shutdown và Health Checks

**Công nghệ:** NestJS lifecycle hooks, Kubernetes probes

**Cách triển khai:**
- Khi shutdown server, không ngắt ngay mà đợi requests hiện tại xong
- Đánh dấu server là "shutting down", không nhận requests mới
- Health check endpoint trả về unhealthy để load balancer ngừng route
- Đợi tất cả connections đóng hoặc timeout
- Sau đó mới tắt server hoàn toàn
- Đảm bảo zero downtime khi deploy hoặc scale down
- Giống như đóng cửa hàng: treo biển "Closing", phục vụ khách trong cửa hàng xong mới khóa cửa

**Cách test:**
```bash
# Start server với graceful shutdown
node dist/main.js

# Tạo long-running request
curl http://localhost:3000/api/long-task &
# PID: 12345

# Gửi SIGTERM signal (graceful shutdown)
kill -TERM 12345

# Server logs:
# "Received SIGTERM, starting graceful shutdown..."
# "Waiting for connections to close..."
# "Long task completed"
# "All connections closed, shutting down"

# Long-running request vẫn hoàn thành trước khi server tắt
```

## Cách chạy các demo

### 1. Cài đặt dependencies

```bash
cd backend
pnpm install
```

### 2. Build ứng dụng

```bash
pnpm run build
```

### 3. Start Redis (cho shared sessions)

```bash
docker run -d --name redis -p 6379:6379 redis:latest
```

### 4. Demo Vertical Scaling (Cluster)

```bash
# Chạy với cluster mode
node backend/dist/cluster.js

# Load test
npm install -g artillery
artillery quick --count 100 --num 10 http://localhost:3000/api/cpu-bound
```

### 5. Demo Horizontal Scaling (Docker)

```bash
# Scale services
docker-compose up --scale api-gateway=3 -d

# Verify instances
docker ps | grep api-gateway

# Load test với load balancer
artillery quick --count 200 --num 20 http://localhost/api/health
```

### 6. Test Load Balancing Strategies

```bash
# Round Robin (default)
docker exec nginx cp /etc/nginx/nginx-round-robin.conf /etc/nginx/nginx.conf
docker exec nginx nginx -s reload

# Least Connections
docker exec nginx cp /etc/nginx/nginx-least-conn.conf /etc/nginx/nginx.conf
docker exec nginx nginx -s reload

# IP Hash
docker exec nginx cp /etc/nginx/nginx-ip-hash.conf /etc/nginx/nginx.conf
docker exec nginx nginx -s reload
```

### 7. Monitor và Metrics

```bash
# Xem logs real-time
docker logs -f api-gateway-1
docker logs -f api-gateway-2
docker logs -f api-gateway-3

# Check Redis sessions
docker exec -it redis redis-cli
> KEYS *
> GET session:abc123

# Monitor system resources
docker stats
```

### 8. Kubernetes Auto-scaling (nếu có K8s)

```bash
# Apply manifests
kubectl apply -f infra/k8s/

# Apply HPA
kubectl apply -f infra/k8s/hpa.yaml

# Monitor HPA
watch kubectl get hpa

# Generate load
kubectl run -it --rm load-generator --image=busybox -- /bin/sh
while true; do wget -q -O- http://api-gateway-service; done
```

### 9. Performance Testing Scripts

```bash
# Test single vs multiple instances
./backend/test-scaling.sh

# Test load balancing
./backend/test-load-balancing.sh

# Results sẽ show response times và distribution
```

## Tài liệu tham khảo

- [Node.js Cluster Documentation](https://nodejs.org/api/cluster.html)
- [Docker Compose Scale](https://docs.docker.com/compose/compose-file/deploy/)
- [Nginx Load Balancing](https://docs.nginx.com/nginx/admin-guide/load-balancer/http-load-balancer/)
- [Kubernetes HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)
- [Scalability Patterns - AWS](https://aws.amazon.com/architecture/well-architected/)
- [The Twelve-Factor App](https://12factor.net/)

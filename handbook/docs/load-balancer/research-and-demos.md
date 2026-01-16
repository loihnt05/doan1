# Research và Demos về Load Balancer

## Tổng quan

Các demo về Load Balancer bao gồm các thuật toán phân phối traffic, health checks, session persistence, và các loại load balancer khác nhau.

## Công nghệ sử dụng

- **Nginx**: Reverse proxy và load balancer phổ biến nhất
- **HAProxy**: High-performance load balancer
- **Kubernetes Service**: Built-in load balancing
- **Docker Compose**: Scaling và basic load balancing
- **Node.js http-proxy**: Programmatic load balancer
- **Redis**: Lưu session data cho sticky sessions
- **Consul/Eureka**: Service discovery

## Các Demo

### Demo 1: Round Robin Load Balancing

**Công nghệ:** Nginx upstream module

**Cách triển khai:**
- Nginx giữ danh sách các backend servers
- Mỗi request đến, Nginx chọn server tiếp theo theo vòng tròn
- Request 1 → Server 1, Request 2 → Server 2, Request 3 → Server 3, Request 4 → Server 1 (lặp lại)
- Không quan tâm server nào đang bận hay rảnh, chỉ chọn theo thứ tự
- Phân phối đều nếu tất cả requests giống nhau
- Giống như phát bài theo vòng tròn, mỗi người một lá

**Cách test:**
```bash
# Cấu hình Nginx
cat > nginx.conf << 'EOF'
upstream backend {
  server api-1:3000;
  server api-2:3000;
  server api-3:3000;
}
server {
  listen 80;
  location / {
    proxy_pass http://backend;
  }
}
EOF

# Start Nginx
docker run -d -p 80:80 -v $(pwd)/nginx.conf:/etc/nginx/nginx.conf nginx

# Gọi nhiều requests
for i in {1..9}; do
  curl http://localhost/api/info
done

# Mỗi server nhận 3 requests
docker logs api-1 | grep "GET /api/info" | wc -l  # 3
docker logs api-2 | grep "GET /api/info" | wc -l  # 3
docker logs api-3 | grep "GET /api/info" | wc -l  # 3
```

### Demo 2: Weighted Round Robin

**Công nghệ:** Nginx weight directive

**Cách triển khai:**
- Gán trọng số (weight) cho mỗi server dựa trên năng lực
- Server mạnh (nhiều CPU/RAM) có weight cao hơn, nhận nhiều requests hơn
- Ví dụ: Server A weight=5, Server B weight=3, Server C weight=2
- Trong 10 requests: A nhận 5, B nhận 3, C nhận 2
- Tận dụng tối đa servers có cấu hình khác nhau
- Giống như chia công việc theo sức lực của từng người

**Cách test:**
```bash
# Cấu hình với weights
cat > nginx.conf << 'EOF'
upstream backend {
  server powerful-api:3000 weight=5;
  server medium-api:3000 weight=3;
  server weak-api:3000 weight=2;
}
EOF

docker exec nginx nginx -s reload

# Gọi 10 requests
for i in {1..10}; do
  curl http://localhost/api/info
done

# Kiểm tra phân phối
docker logs powerful-api | grep "GET" | wc -l  # ~5
docker logs medium-api | grep "GET" | wc -l    # ~3
docker logs weak-api | grep "GET" | wc -l      # ~2
```

### Demo 3: Least Connections

**Công nghệ:** Nginx least_conn directive

**Cách triển khai:**
- Nginx theo dõi số connections đang hoạt động đến mỗi server
- Khi có request mới, chọn server có số connections ít nhất
- Server nào xử lý xong nhanh (ít connections) sẽ nhận thêm requests
- Tự động cân bằng tải khi requests có độ dài khác nhau
- Phù hợp với long-running connections (WebSocket, file upload, streaming)
- Giống như chọn hàng thanh toán ngắn nhất trong siêu thị

**Cách triển khai:**
```bash
# Cấu hình least_conn
cat > nginx.conf << 'EOF'
upstream backend {
  least_conn;
  server api-1:3000;
  server api-2:3000;
  server api-3:3000;
}
EOF

docker exec nginx nginx -s reload

# Tạo long-running requests
curl http://localhost/api/long-task &  # Giữ connection với server 1
curl http://localhost/api/long-task &  # Giữ connection với server 2

# Request tiếp theo sẽ đi vào server 3 (ít connections nhất)
curl http://localhost/api/fast-task

# Check logs
docker logs api-1 | grep "long-task"  # Có
docker logs api-2 | grep "long-task"  # Có
docker logs api-3 | grep "fast-task"  # Có (server rảnh nhất)
```

### Demo 4: IP Hash - Sticky Sessions

**Công nghệ:** Nginx ip_hash directive

**Cách triển khai:**
- Tính hash từ địa chỉ IP của client
- Dựa vào hash để chọn server cố định cho IP đó
- Cùng 1 client (IP) luôn được route đến cùng 1 server
- Giữ được session state trong server (không cần Redis)
- Nếu server down, IP đó sẽ được route đến server khác
- Giống như khách quen luôn được phục vụ bởi cùng 1 nhân viên

**Cách test:**
```bash
# Cấu hình ip_hash
cat > nginx.conf << 'EOF'
upstream backend {
  ip_hash;
  server api-1:3000;
  server api-2:3000;
  server api-3:3000;
}
EOF

docker exec nginx nginx -s reload

# Gọi nhiều requests từ cùng IP
for i in {1..10}; do
  curl http://localhost/api/session
done

# Tất cả requests đi vào cùng 1 server
docker logs api-1 | grep "session" | wc -l  # 10 hoặc 0
docker logs api-2 | grep "session" | wc -l  # 10 hoặc 0
docker logs api-3 | grep "session" | wc -l  # 10 hoặc 0

# Thử từ IP khác (dùng proxy)
curl --proxy http://different-proxy:8080 http://localhost/api/session
# Có thể đi vào server khác
```

### Demo 5: Health Checks - Passive

**Công nghệ:** Nginx max_fails và fail_timeout

**Cách triển khai:**
- Nginx giám sát responses từ servers trong quá trình hoạt động bình thường
- Nếu server trả lỗi (5xx) liên tiếp nhiều lần (max_fails), đánh dấu là unhealthy
- Server unhealthy sẽ không nhận requests trong khoảng thời gian (fail_timeout)
- Sau fail_timeout, thử lại server đó (có thể đã phục hồi)
- Không tốn resources cho health check riêng, chỉ quan sát requests thực
- Giống như ghi nhớ cửa hàng nào đóng cửa, không tiếp tục đến đó

**Cách test:**
```bash
# Cấu hình passive health check
cat > nginx.conf << 'EOF'
upstream backend {
  server api-1:3000 max_fails=3 fail_timeout=30s;
  server api-2:3000 max_fails=3 fail_timeout=30s;
  server api-3:3000 max_fails=3 fail_timeout=30s;
}
EOF

docker exec nginx nginx -s reload

# Shutdown một server để nó lỗi
docker stop api-2

# Gọi requests, sau 3 lần lỗi, api-2 bị loại khỏi pool
for i in {1..10}; do
  curl http://localhost/api/info
done

# Chỉ api-1 và api-3 nhận requests
docker logs api-1 | grep "GET" | wc -l  # ~5
docker logs api-3 | grep "GET" | wc -l  # ~5

# Sau 30 giây, Nginx sẽ thử lại api-2
sleep 35
docker start api-2
curl http://localhost/api/info
# Có thể đi vào api-2 nếu đã phục hồi
```

### Demo 6: Health Checks - Active

**Công nghệ:** HAProxy health check hoặc custom implementation

**Cách triển khai:**
- Load balancer chủ động gửi requests kiểm tra sức khỏe đến servers theo chu kỳ (ví dụ mỗi 5 giây)
- Gọi đến endpoint đặc biệt (health check endpoint): GET /health
- Server trả 200 OK = healthy, trả lỗi hoặc timeout = unhealthy
- Server unhealthy bị loại khỏi pool ngay lập tức (không cần chờ requests thực lỗi)
- Phát hiện sớm vấn đề trước khi ảnh hưởng đến users
- Giống như bác sĩ khám sức khỏe định kỳ, phát hiện bệnh sớm

**Cách test:**
```bash
# Tạo health check endpoint trong ứng dụng
cat > app.js << 'EOF'
app.get('/health', (req, res) => {
  // Check database connection, dependencies, etc.
  if (isHealthy) {
    res.status(200).json({ status: 'ok' });
  } else {
    res.status(503).json({ status: 'error' });
  }
});
EOF

# Cấu hình HAProxy với active health check
cat > haproxy.cfg << 'EOF'
backend servers
  option httpchk GET /health
  server api-1 api-1:3000 check inter 5s
  server api-2 api-2:3000 check inter 5s
  server api-3 api-3:3000 check inter 5s
EOF

docker run -d -p 80:80 -v $(pwd)/haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg haproxy

# Xem HAProxy stats page
open http://localhost:8404/stats

# Stop một server
docker stop api-2

# Sau 5 giây, api-2 tự động bị loại (không cần requests lỗi)
# Check stats: api-2 status = DOWN
```

### Demo 7: Session Persistence với Cookie

**Công nghệ:** Nginx sticky cookie

**Cách triển khai:**
- Load balancer tạo một cookie đặc biệt chứa server ID khi client request lần đầu
- Cookie này được gửi về client và lưu trong trình duyệt
- Các requests tiếp theo, client tự động gửi cookie này
- Load balancer đọc cookie và route đến đúng server đã xử lý lần đầu
- Giữ session state mà không cần shared storage (Redis)
- Giống như tem phiếu, giữ tem để được phục vụ bởi cùng người

**Cách test:**
```bash
# Cấu hình sticky cookie (cần nginx-plus hoặc module)
cat > nginx.conf << 'EOF'
upstream backend {
  sticky cookie srv_id expires=1h;
  server api-1:3000;
  server api-2:3000;
  server api-3:3000;
}
EOF

# Hoặc dùng open source alternative
cat > nginx.conf << 'EOF'
map $cookie_backend $backend_server {
  "~*^api-1" api-1:3000;
  "~*^api-2" api-2:3000;
  default api-3:3000;
}
EOF

# Test với cookie
curl -c cookies.txt http://localhost/api/login
# Response có Set-Cookie: srv_id=api-2

# Requests tiếp theo với cookie
curl -b cookies.txt http://localhost/api/profile
curl -b cookies.txt http://localhost/api/orders
# Tất cả đi vào api-2
```

### Demo 8: Layer 4 vs Layer 7 Load Balancing

**Công nghệ:** HAProxy (cả 2 modes), Nginx (L7)

**Cách triển khai:**
- Layer 4 (Transport): Load balancer làm việc ở TCP/UDP level
  - Không đọc nội dung HTTP, chỉ nhìn IP và port
  - Forward packets trực tiếp, cực nhanh, low latency
  - Không thể routing dựa vào URL path hoặc headers
- Layer 7 (Application): Load balancer đọc HTTP requests
  - Có thể route theo URL, headers, cookies
  - Có thể SSL termination, compression, caching
  - Chậm hơn một chút vì phải parse HTTP
- Giống như Layer 4 là chuyển thư không đọc, Layer 7 là đọc thư rồi phân loại

**Cách test:**
```bash
# Layer 4 - HAProxy TCP mode
cat > haproxy-l4.cfg << 'EOF'
frontend tcp_frontend
  mode tcp
  bind *:80
  default_backend tcp_servers

backend tcp_servers
  mode tcp
  server api-1 api-1:3000
  server api-2 api-2:3000
EOF

# Layer 7 - HAProxy HTTP mode
cat > haproxy-l7.cfg << 'EOF'
frontend http_frontend
  mode http
  bind *:80
  
  # Route dựa vào path
  acl is_api path_beg /api
  acl is_admin path_beg /admin
  
  use_backend api_servers if is_api
  use_backend admin_servers if is_admin

backend api_servers
  mode http
  server api-1 api-1:3000
  server api-2 api-2:3000

backend admin_servers
  mode http
  server admin-1 admin-1:3000
EOF

# Test L4 - routing theo port only
curl http://localhost/anything  # Bất kỳ path nào cũng vào cùng backend

# Test L7 - routing theo path
curl http://localhost/api/users    # Vào api_servers
curl http://localhost/admin/config # Vào admin_servers
```

### Demo 9: Service Discovery với Consul

**Công nghệ:** Consul, consul-template, Nginx

**Cách triển khai:**
- Services tự đăng ký với Consul khi khởi động (service registration)
- Consul giữ danh sách tất cả services đang chạy và health status
- Consul Template tự động tạo Nginx config từ danh sách services trong Consul
- Khi service mới xuất hiện hoặc biến mất, config tự động cập nhật và reload Nginx
- Không cần config servers bằng tay, hệ thống tự động phát hiện
- Giống như danh bạ điện thoại tự động cập nhật khi có người mới

**Cách test:**
```bash
# Start Consul
docker run -d -p 8500:8500 consul agent -dev

# Services tự đăng ký
curl -X PUT http://localhost:8500/v1/agent/service/register \
  -d '{
    "ID": "api-1",
    "Name": "api-service",
    "Address": "192.168.1.10",
    "Port": 3000,
    "Check": {
      "HTTP": "http://192.168.1.10:3000/health",
      "Interval": "10s"
    }
  }'

# Consul template tự generate Nginx config
cat > nginx.conf.tmpl << 'EOF'
upstream backend {
  {{range service "api-service"}}
  server {{.Address}}:{{.Port}};
  {{end}}
}
EOF

consul-template -template "nginx.conf.tmpl:nginx.conf:nginx -s reload"

# Thêm service mới
curl -X PUT http://localhost:8500/v1/agent/service/register \
  -d '{"ID": "api-2", "Name": "api-service", "Address": "192.168.1.11", "Port": 3000}'

# Nginx config tự động cập nhật và reload
cat nginx.conf
# upstream backend {
#   server 192.168.1.10:3000;
#   server 192.168.1.11:3000;  # Mới thêm!
# }
```

### Demo 10: Client-Side Load Balancing

**Công nghệ:** Node.js, service registry (Consul/Eureka)

**Cách triển khai:**
- Không có load balancer trung tâm, mỗi client tự làm load balancing
- Client query service registry để lấy danh sách servers
- Client tự chọn server theo thuật toán (round-robin, random)
- Client gọi trực tiếp đến server đã chọn
- Giảm single point of failure (không có load balancer duy nhất)
- Phù hợp với microservices, service mesh (Istio, Linkerd)
- Giống như tự tìm đường thay vì hỏi bảo vệ chỉ đường

**Cách test:**
```bash
# Tạo client-side load balancer
cat > client-lb.js << 'EOF'
class ClientSideLoadBalancer {
  constructor() {
    this.servers = [];
    this.currentIndex = 0;
    this.discoverServices();
  }

  async discoverServices() {
    // Query Consul
    const response = await fetch('http://consul:8500/v1/catalog/service/api-service');
    this.servers = await response.json();
  }

  getNextServer() {
    const server = this.servers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.servers.length;
    return `http://${server.Address}:${server.ServicePort}`;
  }

  async call(endpoint) {
    const serverUrl = this.getNextServer();
    return fetch(`${serverUrl}${endpoint}`);
  }
}

// Usage
const lb = new ClientSideLoadBalancer();
const response = await lb.call('/api/users');
EOF

# Test
node client-lb.js
# Client tự chọn server và gọi trực tiếp
```

## Cách chạy các demo

### 1. Cài đặt Nginx

```bash
# Trên Docker
docker run -d --name nginx -p 80:80 nginx

# Hoặc local
sudo apt install nginx  # Ubuntu
brew install nginx      # macOS
```

### 2. Cài đặt HAProxy (optional)

```bash
docker run -d --name haproxy -p 80:80 -p 8404:8404 haproxy:latest
```

### 3. Start backend services

```bash
cd backend
docker-compose up --scale api-gateway=3 -d
```

### 4. Test load balancing strategies

```bash
# Copy các config files
cp infra/nginx/nginx-round-robin.conf /etc/nginx/nginx.conf
cp infra/nginx/nginx-least-conn.conf /etc/nginx/nginx.conf
cp infra/nginx/nginx-ip-hash.conf /etc/nginx/nginx.conf

# Reload Nginx
nginx -s reload
# hoặc
docker exec nginx nginx -s reload
```

### 5. Load testing

```bash
# Cài đặt tools
npm install -g artillery
# hoặc
brew install k6

# Run load test
artillery quick --count 1000 --num 50 http://localhost/api/users

# Hoặc với k6
k6 run load-test.js
```

### 6. Monitor traffic distribution

```bash
# Xem logs real-time
docker logs -f api-gateway-1 &
docker logs -f api-gateway-2 &
docker logs -f api-gateway-3 &

# Count requests per instance
docker logs api-gateway-1 | grep "GET" | wc -l
docker logs api-gateway-2 | grep "GET" | wc -l
docker logs api-gateway-3 | grep "GET" | wc -l
```

### 7. Test health checks

```bash
# Stop một instance
docker stop api-gateway-2

# Gọi requests, load balancer tự động loại bỏ unhealthy instance
for i in {1..10}; do
  curl http://localhost/api/health
done

# Start lại
docker start api-gateway-2

# Instance tự động được thêm lại vào pool
```

### 8. HAProxy Stats Dashboard

```bash
# Mở stats page
open http://localhost:8404/stats

# Xem:
# - Số requests mỗi server
# - Response times
# - Health status
# - Error rates
```

### 9. Consul UI (nếu dùng service discovery)

```bash
# Start Consul
docker run -d -p 8500:8500 consul agent -dev

# Mở UI
open http://localhost:8500/ui

# Xem danh sách services và health checks
```

## Tài liệu tham khảo

- [Nginx Load Balancing](https://docs.nginx.com/nginx/admin-guide/load-balancer/http-load-balancer/)
- [HAProxy Documentation](http://www.haproxy.org/)
- [Load Balancing Algorithms - Cloudflare](https://www.cloudflare.com/learning/performance/types-of-load-balancing-algorithms/)
- [Kubernetes Service Load Balancing](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Consul Service Discovery](https://www.consul.io/docs/discovery/services)
- [Layer 4 vs Layer 7 Load Balancing](https://www.nginx.com/resources/glossary/layer-4-load-balancing/)

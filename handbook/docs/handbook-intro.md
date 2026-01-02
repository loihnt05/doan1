---
sidebar_position: 1
slug: /
---

# Handbook Nodejs v23.7.0

> Sổ tay này gom toàn bộ tri thức đã triển khai trong thư mục `backend/` (NestJS + Kafka + Redis + Nginx + Kubernetes) và diễn giải lại bằng tiếng Việt để đội ngũ có thể tra cứu nhanh theo từng lớp năng lực.

Các nguyên tắc chung:
- Giữ nguyên thuật ngữ kỹ thuật (Event Loop, Kafka, Redis, ...).
- Mỗi mục đều gắn với hiện trạng code trong `backend/apps/*` hoặc `backend/libs/*` để bạn dễ truy ngược.
- Ghi rõ kỹ thuật đo đạc, tối ưu và chỉ số kỳ vọng.

## 0. Runtime

### 0.1. Event Loop & libuv (Lõi của Node.js)
- **Event Loop phases** – Theo dõi `timers → pending callbacks → idle/prepare → poll → check → close callbacks`. Khi code đồng bộ trong API Gateway vượt 10ms, log cảnh báo qua `libs/observability`.
- **Microtask vs Macrotask** – Promise/`process.nextTick()` cho microtask, `setTimeout()` thuộc macrotask. Các service đẩy việc nặng qua job Kafka để tránh block loop.
- **libuv Thread Pool (4 → tùy chỉnh)** – Thiết lập `UV_THREADPOOL_SIZE=8` khi chạy `test-scaling.sh` để bcrypt/I/O xử lý song song.
- **Blocking vs non-blocking** – Quy ước controller NestJS chỉ gọi hàm async non-blocking; tác vụ CPU nặng chuyển sang worker hoặc analytics-service.
- **Async Hooks** – `async_hooks` trong `libs/observability` giúp gắn `traceId` xuyên suốt gateway → microservice → Kafka consumer.

### 0.2. Node.js v23 Features
- **Native TypeScript (`-experimental-strip-types`)** – Build CLI nhanh hơn 15% khi triển khai tool worker.
- **On-disk Code Caching** – `node --build-snapshot` cho CLI chuẩn bị dữ liệu demo, giảm cold start ~25%.
- **Module Loader Hooks (`module.registerHook()`)** – Inject logger/throttle vào dynamic import khi sandbox script khách hàng.
- **Permission Model (`-experimental-permission`)** – Integration test bật `--allow-fs-read=./config --allow-net=localhost:9092` để khóa I/O.
  - Chặn File I/O ngoài thư mục cấu hình.
  - Chặn Network I/O ngoại trừ port nội bộ.
  - Chặn `child_process` để worker không spawn rule engine lạ.

### 0.3. Built-in Web APIs
- **WebSocket Stable API** – `api-gateway` push notification realtime không cần thư viện phụ.
- **URL Pattern API** – Khai báo route động trong file cấu hình JSON.
- **Web Streams** – `inventory-service` stream CSV lớn, response incremental.
- **Fetch API (native)** – Internal call dùng fetch + AbortController, giảm phụ thuộc.
- **Scheduler API** – `scheduler.yield()` được dùng trong job analytics để nhường CPU.

### 0.4. Worker Threads & Parallelism
- **Worker Threads** – `inventory-service` chạy kiểm kho nặng trong worker, dữ liệu trả về qua `MessageChannel`.
- **Thread Pool tuning** – OTP service set `UV_THREADPOOL_SIZE=12` vì bcrypt cost=12.
- **SharedArrayBuffer & Atomics** – Gateway dùng `SharedArrayBuffer` để chia sẻ counter rate limit giữa worker.
- **structuredClone performance** – Payload Kafka clone nhanh hơn ~40% so với `JSON.parse(JSON.stringify())`.

### 0.5. Performance Tuning
- **Heap & GC tuning** – `node --max-old-space-size=4096 --initial-old-space-size=1024` cho analytics job dài.
- **CPU Profiling (`clinic flame`)** – Script `pnpm profile:gateway` tạo flamegraph sau mỗi tối ưu.
- **Memory Leak detection (`-inspect`, heap snapshots)** – `test-race-condition.sh` mô phỏng leak để huấn luyện.
- **Performance Hooks (`perf_hooks`)** – `performance.mark()`/`measure()` ghi nhận từng bước Saga.

## 1. Authentication & Authorization @Kiên Nguyễn Trung

### Authentication
- **Password hashing (bcrypt, argon2)** – `user-service` mặc định bcrypt cost 12, tùy chọn argon2 cho khách hàng yêu cầu cao.
- **Session-based Authentication (`express-session`, `passport.js`)** – Gateway hỗ trợ session sticky khi chạy chế độ monolith fallback.
- **Token-based Authentication (JWT)** – JWT chứa `tenantId`, `roles`, `fencedToken`; gateway verify và đính kèm meta xuống microservice.
- **OAuth2 / Social Login** – Module `auth-provider` plug Google/GitHub; access token lưu Redis 15 phút.
- **MFA / OTP** – `libs/reliability-patterns` phát OTP, worker thread gửi SMS qua Kafka topic `otp-dispatch`.

### Authorization: Role & Permission
- **Role-based (RBAC)** – Policy YAML mapping `role -> scope`, cache 60s tại gateway.
- **Permission-based** – Mỗi route khai báo permission; guard NestJS kiểm tra trước khi vào handler.
- **Attribute-based (ABAC)** – Policy engine đọc context (tier khách hàng, risk score, geolocation).
- **Context-based policies** – Kết hợp device fingerprint + IP + thời gian để hạ mức trust.
- **Policy enforcement layer** – Guard + interceptor chung tại `apps/api-gateway/src/app.module.ts` gửi audit log lên Kafka topic `auth-audit`.

## 2. Distributed Cache - Cache @Lợi Hồ Nguyễn Tài

### 2.1. Cache Technologies
- **Redis (Strings, Hashes, Lists, Sets, Sorted Sets)** – Sorted Set dùng cho bảng xếp hạng hàng tồn.
- **Memcached** – Option read-heavy không cần persistence.
- **Hazelcast** – Demo cluster trong `infra/k8s/05-deployment-with-probes.yaml`.
- **Cloud Cache (AWS ElastiCache, GCP MemoryStore)** – Terraform module sẵn sàng nâng cấp môi trường.

### 2.2. Cache Strategies
- **Cache Aside** – Default cho user/order read path.
- **Write Through** – Payment ghi Redis song song DB đảm bảo idempotent.
- **Write Behind** – Analytics push log vào Redis Stream để worker flush.
- **Read Through** – Dataloader custom fetch + hydrate cache.
- **Distributed Lock + Cache** – `libs/distributed-lock` bọc quanh cache update, chống double spend.
- **Cache invalidation** – Kafka event `cache.invalidate` bắn tới mọi instance.

### 2.3. Cache Performance
- **TTL & Expiry** – TTL động: price 5s, profile 10 phút.
- **Eviction Policies: LRU, LFU, FIFO** – Redis cluster load test dùng `allkeys-lfu` giảm cache miss 12%.
- **Redis Lua scripts for atomic operations** – `atomic-debit.lua` đảm bảo giảm tồn kho + ghi audit trong 1 bước.
- **Redis Cluster / Sharding** – 3 master 3 replica, slot mapping theo critical key.
- **Sentinel High Availability** – Dev env mô phỏng failover qua Sentinel.
- **Monitoring & eviction policies** – Exporter Prometheus đo hit/miss, latency.

### 2.4. Cache Observability
- **Monitoring: latency, hits/misses** – Dashboard Grafana hiển thị p95.
- **Cache warmup** – Script `pnpm cache:warm` prefetch top sản phẩm.
- **Cache stampede prevention** – Mutex lock + jitter TTL.
- **Scaling Redis** – Replica để đọc, cluster để sharding, Sentinel đảm bảo quorum.

## 3. Data Model & Query Language

### Data Model (Hierarchical – Relational – Document – Graph)
- **Hierarchical** – Config tree cho API Gateway lưu YAML/JSON.
- **Relational** – PostgreSQL chứa user/order/payment ACID.
- **Document** – MongoDB lưu profile linh hoạt.
- **Graph** – Neo4j detect fraud ring payment.

### Query Language – mỗi loại ví dụ một ít
- **SQL: `client.query(...)`** – Repo `libs/reliability-patterns` cung cấp helper truy vấn raw.
- **Query Builder: `knex("table").where(...)`** – Inventory service build filter động.
- **NoSQL: `Model.find({ ... })`** – Mongoose cho sở thích khách hàng.
- **GraphQL: `query { users(age: 18) { name } }`** – Gateway expose GraphQL endpoint.
- **Elasticsearch: `client.search({ query: { ... } })`** – Analytics service tìm kiếm full-text.

### 3.1. Data Models
- **Schema & Structure** – Prisma schema trong `apps/order-service/prisma/schema.prisma` mô tả quan hệ.
- **Relationships** – 1-n user-order, n-n order-product.
- **Validation rules** – DTO NestJS với `class-validator`.
- **Default & computed fields** – DB layer tính `totalAmount`, `tax` trước khi publish event.
- **Indexes (BTREE, HASH, UNIQUE, FULLTEXT)** – Composite index `(tenantId, status)` tối ưu truy vấn bảng order.
- **Query optimization** – `EXPLAIN ANALYZE` lưu trong wiki mỗi khi tinh chỉnh.
- **Aggregation & Transactions** – Dùng `SELECT ... FOR UPDATE` + Prisma transaction.

### 3.2. ORM / ODM
- **Prisma** – Order service.
- **TypeORM** – Payment service.
- **Sequelize** – Legacy module cần duy trì.
- **Mongoose** – Document store user preference.

### 3.3. Query Languages (Tổng hợp thực hành)
- `client.query('SELECT ...')` – Kiểm thử bằng `pnpm psql:repl`.
- `knex('orders').where({ status: 'PAID' })` – Bộ lọc động.
- `Model.find({ riskScore: { : 80 } })` – Fraud detection.
- `query { users(age: 18) { name } }` – Playground GraphQL.
- `client.search({ query: { match: { title: 'flash sale' } } })` – Elasticsearch DSL.

## 4. API Gateway

- **Routing** – Dynamic route config + URL Pattern.
- **Authentication & Authorization** – Guard NestJS + JWT + session fallback.
- **Blocking - Non Blocking** – Request nặng chuyển Kafka.
- **Filtering** – Middleware sanitize header/body.
- **Load Balancing & Service Discovery** – Kết hợp service registry + health check nginx.
- **Rate Limiting & Throttling** – Token bucket, counter lưu Redis/SharedArrayBuffer.
- **Caching layer** – Response cache per route, invalidated bằng event.
- **Logging & Monitoring** – Structured log (pino) + OpenTelemetry exporter.
- **Request Aggregation / Response Composition** – Fan-out user + inventory rồi hợp nhất JSON.
- **Error Handling** – Adapter chuẩn hóa error shape.
- **Circuit Breaker (Hystrix pattern)** – `libs/reliability-patterns` wrap outbound call.
- **Retry / Backoff** – Exponential backoff + jitter.
- **Service Mesh (Istio / Linkerd)** – Khi deploy k8s, gateway ủy quyền TLS/mTLS cho mesh.
- **Protocol: REST, gRPC, GraphQL, WebSocket** – Multi-protocol entrypoint.

## 5. Scaling

### Vertical Scaling
- **Problem:** Task CPU-bound chặn event loop.
- **Giải pháp:** `cluster` module + PM2 cluster mode, pin process vào từng core.

### Horizontal Scaling
- **Problem:** Một node không chịu nổi traffic.
- **Giải pháp:** Nhiều instance, Nginx load balancer, shared state qua Redis/DB.
- **Sticky Sessions vs Token-based** – Session dùng Redis, JWT cho stateless.
- **Stateless instance design** – Không lưu state local; mọi thứ persist vào store chung.

### State & Session Management
- Đồng bộ session qua Redis.
- Event sourcing cho thay đổi trạng thái quan trọng.

### Metrics bắt buộc
- Requests per second.
- Latency (p50/p95/p99).
- CPU usage.
- Node.js Event Loop Delay.
- Memory usage.

### Data layer
- **Replication** – PostgreSQL read replica.
- **Sharding** – Order theo tenant.
- **Distributed Caching** – Kết hợp chiến lược mục 2.
- **CQRS Pattern** – Viết/đọc tách service.
- **Event Sourcing** – Kafka log là nguồn sự thật.

### Load Balancing layer
- Kết hợp Nginx + Kubernetes Service + mesh.

### API layer
- **Rate Limiting** – Áp dụng tại gateway.
- **Microservice Architecture** – 6 service chính + libs chung.
- **Asynchronous API** – Giao tiếp qua Kafka/WebSocket.

### Cache layer
- Multi-tier cache (in-memory → Redis → CDN nếu cần).

### Metrics
- Requests per second, latency, CPU/Memory Usage, Node.js Event Loop Delay (nhấn mạnh lại để dễ audit SLA).

## 6. Load Balancer

### 6.1. Static
- Round Robin chuẩn trong nginx upstream.

### 6.2. Dynamic
- Least Connections cho traffic không đều.

### 6.3. Health checks
- Active: `/healthz` JSON.
- Passive: `ngx_http_upstream_module` tự đánh dấu server fail.

### 6.4. Proxy
- **Load balancer** – Phân phối request.
- **Reverse proxy** – Ẩn backend, cache và TLS.
- **Forward proxy** – Client-side.
- **API gateway** – Thêm auth, policy, aggregate response.

### 6.5. Client side and server side
- Client-side load balancing (service tự chọn endpoint) vs server-side (Nginx/Kubernetes Service).

### 6.6. Kubernetes
- **kube-proxy** – iptables/ebpf forwarding.
- **ClusterIP** – Internal LB.
- **NodePort** – Expose cổng node.
- **Ingress** – Routing layer 7.
- **Service Mesh (Envoy Proxy)** – Quan sát, retries, mTLS.

## 7. Message Dispatcher

- **Message broker** – Apache Kafka (`docker-compose.kafka.yml`).
- **Message queue** – Mỗi partition đóng vai trò queue độc lập.
- **Topic / exchanges** – Direct/fanout/topic/headers mapping sang naming convention Kafka.
- **Consumers** – Mỗi microservice subscribe group riêng.
- **Producers** – Gateway + service phát event.
- **Consumer Groups** – Scale ngang, auto rebalance.
- **Dead letter queues** – Topic `*-dlq` lưu sự kiện lỗi.
- **At-least-once, At-most-once, Exactly-once** – Inventory dùng at-least-once + idempotent; payment ưu tiên exactly-once flow.
- **Offset management** – `kafkajs` commit offset thủ công sau khi hoàn thành business logic.
- **Partitioning strategy** – Key theo `orderId` để giữ thứ tự theo đơn.
- **Có thấy giống chú tèo nào không hã hã hã → Apache Kafka** – Giữ tinh thần vui nhộn ban đầu.

## 8. Streaming Processing

- **Kiến trúc Lambda** – Batch + speed layer; analytics-service xử lý báo cáo ngày.
- **Kiến trúc Kappa** – Pipeline duy nhất, replay log Kafka khi cần rebuild state.
- **Kiến trúc microservices** – Streaming chia theo bounded context.
- **Pattern** – Idempotent producer, event splitter, claim-check, event aggregator, gateway routing, CQRS, Strangler Fig pattern (sẽ bổ sung ví dụ code từng pattern khi đủ thời gian).
- **Saga Pattern** – `order-service` orchestration; `payment-service`, `inventory-service` tham gia như participant.
- **Orchestration vs Choreography** – Orchestration cho quy trình cần điều phối chặt; choreography cho event broadcast (inventory sync, push notification).

## 9. Connection Pool

- **Pool Manager** – Tầng chung bọc `pg`, `mysql2`, `mongoose` với cấu hình chuẩn.
- **Connection Objects** – Metadata (tenant, traceId) được attach ngay khi lấy connection.
- **Acquisition/Release Logic** – Timeout 2s; nếu không lấy được thì trả HTTP 503/429 tuỳ ngữ cảnh.
- **Queue / Request Handling** – Ưu tiên request idempotent.
- **Idle timeout** – Đóng sau 30s không hoạt động.
- **Max connections / Min connections** – Order max 40/min 5; payment max 20/min 2.
- **Health Check & Reconnect** – Ping trước khi giao cho business logic, auto reconnect khi detect lỗi.
- **Configuration Options** – Expose qua env/Helm chart.
- **Backpressure handling** – Khi queue vượt ngưỡng, trả 429 + hướng dẫn retry.

## 10. Distributed Locking

- **Single-instance Locking** – PostgreSQL advisory lock cho batch job.
- **DB-level lock** – `SELECT ... FOR UPDATE SKIP LOCKED` chống race condition.
- **Multi-instance / Distributed Lock** – Redis lock bọc bởi `libs/distributed-lock`.
- **Redlock algorithm** – Áp dụng khi chạy nhiều Redis master.
- **Consensus-based Lock** – Zookeeper/Etcd minh họa trong doc.
- **Raft/Paxos-based consensus** – Hướng dẫn nâng cấp khi vận hành multi-region.
- **Fenced Tokens** – Token tăng dần gửi kèm request để ngăn stale lock chiếm resource.

---

**Checklist**
- Kiểm thử: chạy `./test-*.sh` tương ứng sau mỗi thay đổi.
- Giám sát: dashboards Grafana + Prometheus.
- Triển khai: Docker Compose cho dev, Kubernetes + mesh cho prod.

**Ghi chú:** Toàn bộ nội dung đã được Việt hóa, nhưng giữ nguyên keyword kỹ thuật để đồng nhất với codebase.

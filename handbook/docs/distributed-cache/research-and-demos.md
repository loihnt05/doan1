# Distributed Cache - Demo và Triển Khai

Tài liệu mô tả các phần demo thực tế cho hệ thống distributed caching.

## Công nghệ sử dụng

- **Cache Server**: Redis Stack
- **Client Libraries**: @nestjs/cache-manager, Keyv, @keyv/redis
- **Alternative**: Memcached, Hazelcast
- **Monitoring**: Redis Insight (port 8001)
- **Backend Framework**: NestJS
- **Multi-layer**: Memory cache + Redis

## Các Phần Demo

### Demo 1: Cache Aside (Lazy Loading)

**Công nghệ**: Redis + cache-manager + Keyv

**Cách triển khai**:
- Application tự quản lý việc đọc và ghi vào cả cache lẫn database
- Khi có request, check cache trước bằng cacheManager.get() với cache key
- Nếu cache hit, trả về data từ cache ngay lập tức (latency thấp ~1-5ms)
- Nếu cache miss, query database để lấy data (latency cao ~50-200ms)
- Sau khi lấy từ DB, ghi vào cache với TTL (ví dụ 60 giây) để requests sau được nhanh hơn
- Khi update data, ghi vào DB trước, sau đó invalidate (xóa) cache key tương ứng
- Data chỉ được load vào cache khi thực sự cần thiết (lazy loading)

**Cách test**:
- GET `/cache-strategies/cache-aside/:id` lần đầu → cache miss, query DB, latency cao (~100ms), source="database"
- GET cùng endpoint lần 2 trong vòng 60s → cache hit, latency thấp (~2ms), source="cache"
- PUT `/cache-strategies/cache-aside/:id` để update → invalidate cache
- GET lại → cache miss again, phải query DB lại
- Verify bằng Redis Insight: sau PUT thì key bị xóa, sau GET mới thì key xuất hiện lại

---

### Demo 2: Write Through

**Công nghệ**: Redis với synchronous write pattern

**Cách triển khai**:
- Cache nằm giữa application và database như một proxy layer
- Mọi write operation đều phải đi qua cache trước
- Cache đồng bộ ghi xuống database ngay lập tức (synchronous)
- Đảm bảo cache và database luôn sync với nhau
- Read operation check cache trước, miss thì query DB và update cache
- Write latency cao hơn Cache Aside vì phải ghi cả 2 nơi tuần tự
- Phù hợp cho use cases cần data consistency cao

**Cách test**:
- PUT `/cache-strategies/write-through/:id` với data mới
- Quan sát logs: ghi vào cache trước, sau đó sync ghi xuống DB
- Measure latency: sẽ cao hơn vì phải đợi cả 2 operations hoàn thành
- GET `/cache-strategies/write-through/:id` → luôn consistent vì vừa ghi
- Check Redis Insight: key xuất hiện ngay sau write
- Restart application → cache cleared, GET lần đầu miss nhưng data vẫn đúng từ DB

---

### Demo 3: Write Behind (Write Back)

**Công nghệ**: Redis + Background queue processing

**Cách triển khai**:
- Write operation ghi vào cache ngay lập tức và trả về success cho client (low latency)
- Các write operations được đưa vào queue trong memory
- Background processor chạy định kỳ (ví dụ mỗi 5 giây) để batch write queue xuống database
- Asynchronous write giúp giảm latency cho client, tăng throughput
- Trade-off: có risk mất data nếu server crash trước khi flush queue
- Implement write queue với array, mỗi item ghi timestamp
- Suitable cho logging, analytics, non-critical writes

**Cách test**:
- PUT `/cache-strategies/write-behind/:id` nhiều lần liên tiếp
- Response trả về ngay lập tức (latency thấp ~5-10ms)
- Quan sát logs: writes được queue lên, chưa ghi DB ngay
- Đợi 5 giây, logs hiển thị "Flushing write queue" → batch write to DB
- GET ngay sau PUT → cache hit, data available
- Check database sau 5s → data mới được persist
- Simulate crash (kill process) giữa PUT và flush → data loss

---

### Demo 4: Read Through

**Công nghệ**: Redis với automatic cache population

**Cách triển khai**:
- Cache tự động load data từ database khi cache miss
- Application chỉ request vào cache, không cần biết DB
- Cache layer chịu trách nhiệm đồng bộ với database
- Khi cache miss, cache tự query DB, populate cache, rồi trả về data
- Giảm code duplication ở application layer vì logic caching được centralized
- Implement bằng cách wrap DB query logic trong cache service
- Similar to Cache Aside nhưng logic được handle ở cache layer thay vì application

**Cách test**:
- GET `/cache-strategies/read-through/:id` lần đầu
- Cache tự động check, miss, query DB, populate cache trong suốt (transparent)
- Response có metadata: source="database" cho lần đầu
- GET lần 2 → source="cache", không có DB query
- Verify logs: thấy cache layer tự động handle DB interaction
- Không cần application code riêng để sync cache

---

### Demo 5: Cache Invalidation Strategies

**Công nghệ**: Redis TTL + Manual invalidation + Event-based

**Cách triển khai**:
- **TTL-based**: Set expiration time khi ghi cache (60s, 5m, 1h)
- **Manual invalidation**: Xóa cache key khi có update/delete operations
- **Event-based**: Listen to database events để invalidate related cache keys
- **Pattern-based**: Xóa nhiều keys cùng lúc bằng pattern matching (ví dụ `user:*`)
- **Version-based**: Thêm version vào cache key, tăng version khi update
- **Tag-based**: Group cache keys theo tags, invalidate theo tag
- Implement với Redis DEL command, KEYS pattern, hoặc SCAN for production

**Cách test**:
- Set cache với TTL 10s, đợi hết TTL → cache tự động expire
- Update data → manual invalidate cache key → GET phải query DB lại
- Invalidate pattern `product:*` → xóa tất cả product cache keys
- Version-based: cache key `product:1:v1`, update tăng lên `product:1:v2`, old key ignored
- Monitor Redis Insight: thấy keys disappear khi invalidate
- Check memory usage giảm sau mass invalidation

---

### Demo 6: Distributed Lock với Cache

**Công nghệ**: Redis với SETNX/SET NX pattern

**Cách triển khai**:
- Sử dụng Redis atomic operations để implement distributed locking
- SET key với NX (only if not exists) và EX (expiration) để acquire lock
- Lock key format: `lock:resource:id`, value = unique token
- Khi muốn thực thi critical section, try acquire lock với timeout
- Nếu lock thành công, thực thi operation, sau đó release lock
- Nếu fail to acquire, retry với exponential backoff hoặc return error
- Automatic lock expiration để tránh deadlock nếu process crash
- Verify lock ownership trước khi release bằng Lua script

**Cách test**:
- Start 2 concurrent requests để update cùng resource
- Request 1 acquire lock thành công, thực thi operation (~2s)
- Request 2 try acquire lock → blocked/queued
- Request 1 release lock sau khi done
- Request 2 acquire lock, thực thi operation
- Verify không có race condition: final state consistent
- Test lock expiration: acquire lock, delay 30s (quá TTL), lock tự release
- Check Redis: thấy lock key xuất hiện và biến mất theo lifecycle

---

### Demo 7: Multi-layer Caching

**Công nghệ**: Memory cache (L1) + Redis (L2)

**Cách triển khai**:
- Layer 1 (L1): In-memory cache với Keyv CacheableMemory, LRU eviction, size limit 5000 items, TTL 60s
- Layer 2 (L2): Redis distributed cache, TTL dài hơn (5 phút), shared across instances
- Request check L1 first (ultra-fast ~0.1ms), hit thì return ngay
- L1 miss → check L2 (fast ~1-2ms), hit thì update L1 và return
- L2 miss → query database, populate cả L1 và L2
- L1 eviction (LRU) khi đầy → data vẫn còn ở L2
- Reduce Redis load vì L1 filter majority of requests

**Cách test**:
- GET resource lần đầu → miss both layers, query DB, populate L1 + L2
- GET lần 2 → L1 hit, ultra-fast response
- Đợi 60s (L1 TTL expire) → GET lại → L1 miss, L2 hit, repopulate L1
- Load test với 1000 requests → majority hit L1, ít requests đến L2
- Monitor metrics: L1 hit rate ~90%, L2 hit rate ~9%, DB query ~1%
- Check memory usage: L1 limited size, L2 unlimited (until Redis memory)

---

### Demo 8: Redis Data Structures

**Công nghệ**: Redis native data structures

**Cách triển khai**:
- **String**: Simple key-value, GET/SET, increment counter
- **Hash**: Object storage, HGET/HSET fields, suitable for user profiles
- **List**: Queue implementation, LPUSH/RPOP, activity logs, recent items
- **Set**: Unique items, SADD/SMEMBERS, tags, followers
- **Sorted Set**: Ranked data, ZADD with score, leaderboards, time-series
- **Stream**: Event log, XADD/XREAD, message queue, real-time feeds
- Mỗi structure có use case riêng, performance characteristics khác nhau

**Cách test**:
- POST `/redis/string` → SET key-value → GET verify
- POST `/redis/hash` → HSET user fields → HGETALL retrieve full object
- POST `/redis/list` → LPUSH items → LRANGE view list → LPOP consume
- POST `/redis/set` → SADD tags → SMEMBERS get unique tags → SISMEMBER check membership
- POST `/redis/sorted-set` → ZADD scores → ZRANGE get top N → ZINCRBY update score
- View all data structures trong Redis Insight với visualization
- Benchmark mỗi operation: string fastest, sorted set slowest

---

### Demo 9: Cache Performance Comparison

**Công nghệ**: Redis vs Memcached vs In-Memory

**Cách triển khai**:
- Setup 3 cache backends: Redis (default), Memcached (alternative), In-Memory (baseline)
- Benchmark các operations: SET, GET, DELETE với 1000 keys
- Measure latency: min, max, average, p95, p99 cho mỗi backend
- Test throughput: operations per second mỗi backend
- Compare memory usage và eviction behavior
- Test persistence: Redis có RDB/AOF, Memcached và Memory không persist

**Cách test**:
- Run benchmark script: writes 1000 keys to each cache
- Measure write latency: In-Memory < Memcached < Redis (do network + persistence)
- Measure read latency: In-Memory < Redis < Memcached
- Test eviction: fill memory limit, observe LRU behavior
- Restart services: Redis data persists, Memcached data lost, Memory cleared
- Check Redis RDB file: snapshot saved to disk
- Compare: Redis best for persistence, Memcached for pure speed, Memory for testing

---

### Demo 10: Cache Stampede Prevention

**Công nghệ**: Redis + Probabilistic Early Expiration

**Cách triển khai**:
- Cache stampede xảy ra khi cache expire và nhiều requests đồng thời query DB
- Implement lock mechanism: first request acquire lock, others wait
- Alternative: probabilistic early expiration - refresh cache trước khi expire
- Calculate probability based on remaining TTL: `random() * TTL < time_to_expire`
- Early refresh nếu probability hit, ngăn synchronized expiration
- Set new cache với jitter: TTL + random offset để spread expirations
- Monitor concurrent DB queries during cache miss

**Cách test**:
- Set cache với TTL 30s
- At 25s mark, send 100 concurrent requests
- Without stampede prevention: 100 DB queries khi cache expire
- With lock: 1 DB query, 99 requests wait for cache to populate
- With early expiration: refresh ở ~24-26s (random), requests hit refreshed cache
- Monitor DB query count: should be 1 instead of 100
- Check logs: see lock acquisition và early refresh events

---

## Setup và Chạy Demo

**Redis Stack installation**:
```bash
# Run Redis với Insight UI
docker run -d --name redis-stack \
  -p 6379:6379 -p 8001:8001 \
  -e REDIS_ARGS="--requirepass mypassword" \
  redis/redis-stack:latest

# Verify Redis
redis-cli ping
# Response: PONG
```

**Memcached installation** (optional):
```bash
# Run Memcached
docker run -d --name memcached -p 11211:11211 memcached

# Verify
telnet localhost 11211
> stats
```

**Dependencies cần cài đặt**:
```
pnpm install @nestjs/cache-manager cache-manager
pnpm install keyv @keyv/redis cacheable
pnpm install redis ioredis
pnpm install memcached @types/memcached
```

**Environment variables**:
- `REDIS_URL`: redis://localhost:6379
- `REDIS_PASSWORD`: mypassword (nếu có)
- `MEMCACHED_SERVERS`: localhost:11211
- `CACHE_TTL`: 300 (seconds)
- `CACHE_MAX_ITEMS`: 5000

**Module setup trong NestJS**:
```typescript
// Cache module với multi-store
CacheModule.registerAsync({
  useFactory: () => ({
    stores: [
      new Keyv({ store: new CacheableMemory({ ttl: 60000, lruSize: 5000 }) }),
      new KeyvRedis('redis://localhost:6379'),
    ],
  }),
})
```

**Khởi động**:
```bash
# Start Redis và Memcached
docker-compose up -d

# Start NestJS backend
cd backend
pnpm run start:dev

# Access Redis Insight
open http://localhost:8001
```

**Testing endpoints**:
- Cache Aside: GET/PUT `/cache-strategies/cache-aside/:id`
- Write Through: PUT `/cache-strategies/write-through/:id`
- Write Behind: PUT `/cache-strategies/write-behind/:id`
- Read Through: GET `/cache-strategies/read-through/:id`
- Redis structures: POST/GET `/redis/{string|hash|list|set|sorted-set}`

**Monitoring tools**:
- **Redis Insight**: Web UI tại port 8001, visualize keys, values, TTL
- **Redis CLI**: `redis-cli` để chạy commands trực tiếp
- **NestJS logs**: Observe cache operations với Logger
- **Metrics endpoint**: GET `/metrics` cho cache hit/miss ratio

**Performance testing scripts**:
```bash
# Load test với Apache Bench
ab -n 1000 -c 10 http://localhost:3000/cache-strategies/cache-aside/1

# Benchmark cache operations
npm run benchmark:cache

# Test cache stampede
npm run test:stampede
```

**Debug tips**:
- Enable Redis slow log: `CONFIG SET slowlog-log-slower-than 1000`
- Monitor memory: `INFO memory` trong redis-cli
- Track cache keys: `KEYS pattern` (dev only, use SCAN in production)
- Check TTL: `TTL key` để xem remaining seconds
- Monitor hits/misses: `INFO stats` trong Redis

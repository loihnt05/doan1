# Research và Demos về Distributed Locking

## Tổng quan

Các demo về Distributed Locking bao gồm race condition prevention, Redis locks, fenced tokens, database locks, và các chiến lược lock khác nhau để đảm bảo mutual exclusion trong hệ thống phân tán.

## Công nghệ sử dụng

- **Redis**: SET NX PX, Redlock algorithm
- **PostgreSQL Advisory Locks**: pg_advisory_lock
- **Database Row Locks**: SELECT FOR UPDATE
- **Redlock**: Distributed lock algorithm
- **Zookeeper**: Distributed coordination
- **etcd**: Distributed key-value store với lock support
- **Custom Lock Manager**: Implementation tự build

## Các Demo

### Demo 1: Race Condition Problem - No Lock

**Công nghệ:** Node.js, concurrent requests

**Cách triển khai:**
- Có 2 API instances cùng xử lý balance = 1000
- Instance 1 và 2 đồng thời đọc balance (cả 2 thấy 1000)
- Cả 2 check đủ tiền để trừ 100
- Instance 1 ghi balance = 900, Instance 2 cũng ghi balance = 900
- Kết quả sai: balance = 900 (đáng lẽ phải là 800)
- Đây là race condition: "check-then-act" pattern
- Giống như 2 người cùng lấy cùng 1 chiếc ghế trống vì cả 2 đều thấy ghế trống lúc check

**Cách test:**
```bash
# Start 2 instances
node server.js --port 3000 &
node server.js --port 3001 &

# Init balance
curl -X POST http://localhost:3000/api/balance/init -d '{"amount": 1000}'

# Gửi 2 requests đồng thời
curl -X POST http://localhost:3000/api/payment -d '{"amount": 100}' &
curl -X POST http://localhost:3001/api/payment -d '{"amount": 100}' &

# Check balance
curl http://localhost:3000/api/balance
# Expected: 800
# Actual: 900 (BUG: lost update!)

# Logs show both instances read 1000 and wrote 900
```

### Demo 2: Simple Redis Lock - SET NX

**Công nghệ:** Redis SET with NX (Not Exists) option

**Cách triển khai:**
- Trước khi xử lý, acquire lock bằng `SET key value NX PX timeout`
- NX = chỉ set nếu key chưa tồn tại (atomic operation)
- PX = set expiration time (ms) để tự động release nếu crash
- Nếu acquire thành công (return OK), process được chạy
- Nếu thất bại (return null), nghĩa là có instance khác đang giữ lock
- Sau khi xong, delete key để release lock
- Giống như móc khóa toilet: lấy được là vào, không lấy được thì đợi

**Cách test:**
```bash
# Instance 1: Acquire lock
redis-cli SET "lock:payment:user123" "instance-1" NX PX 5000
# Response: OK (acquired)

# Instance 2: Try acquire same lock
redis-cli SET "lock:payment:user123" "instance-2" NX PX 5000
# Response: (nil) (failed - locked by instance 1)

# Code example
async function processPayment(userId, amount) {
  const lockKey = `lock:payment:${userId}`;
  const lockValue = `instance-${process.pid}`;
  
  // Try acquire lock
  const acquired = await redis.set(lockKey, lockValue, 'NX', 'PX', 5000);
  
  if (!acquired) {
    throw new Error('Resource is locked by another process');
  }
  
  try {
    // Critical section - only one instance executes
    const balance = await getBalance(userId);
    if (balance >= amount) {
      await updateBalance(userId, balance - amount);
    }
  } finally {
    // Release lock
    await redis.del(lockKey);
  }
}

# Test concurrent requests
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/payment \
    -d '{"userId": "user123", "amount": 100}' &
done

# Result: Only 1 request at a time, no race condition
```

### Demo 3: Lock with Timeout - Prevent Deadlock

**Công nghệ:** Redis PX option, TTL

**Cách triển khai:**
- Lock phải có timeout (TTL) để tự động expire
- Nếu process crash sau khi acquire lock nhưng trước khi release, lock sẽ stuck mãi mãi
- Với TTL (ví dụ 5 giây), lock tự động bị xóa sau 5s
- Cần chọn TTL đủ dài để process kịp chạy xong
- Nếu process chạy lâu hơn TTL, lock sẽ expire giữa chừng (nguy hiểm!)
- Trade-off: TTL ngắn (nhanh recover) vs TTL dài (an toàn hơn)
- Giống như đèn toilet tự tắt sau 10 phút nếu không có người

**Cách test:**
```bash
# Process 1: Acquire lock và crash
redis-cli SET "lock:order:123" "worker-1" NX PX 5000
# Process starts but crashes immediately
# Lock is stuck!

# Process 2: Try acquire after 6 seconds
sleep 6
redis-cli SET "lock:order:123" "worker-2" NX PX 5000
# Response: OK (lock expired and released automatically)

# Test TTL
redis-cli SET "lock:test" "value" NX PX 5000
redis-cli TTL "lock:test"
# Response: 5 (seconds remaining)

sleep 3
redis-cli TTL "lock:test"
# Response: 2

sleep 3
redis-cli GET "lock:test"
# Response: (nil) (expired)

# Code with proper TTL
const LOCK_TTL = 5000; // 5 seconds
const OPERATION_TIME = 3000; // Expected 3 seconds

if (OPERATION_TIME > LOCK_TTL * 0.8) {
  console.warn('Operation time too close to lock TTL!');
}
```

### Demo 4: Fenced Tokens - Prevent Stale Writes

**Công nghệ:** Redis INCR, monotonic counter

**Cách triển khai:**
- Mỗi lần acquire lock, tạo token tăng dần (1, 2, 3, 4...)
- Process giữ token này trong suốt thời gian xử lý
- Khi ghi dữ liệu, check token có còn valid không
- Nếu có process khác đã acquire lock sau (token mới hơn), token cũ bị reject
- Ngăn được vấn đề: process chậm (do GC pause) ghi dữ liệu cũ
- Đảm bảo chỉ process với token mới nhất mới được ghi
- Giống như tem phiếu có số thứ tự, chỉ tem mới nhất được chấp nhận

**Cách test:**
```bash
# Process A: Get token 1
TOKEN_A=$(redis-cli INCR "fence:order:123")
echo "Process A token: $TOKEN_A"  # 1

# Process A acquires lock
redis-cli SET "lock:order:123" "process-a" NX PX 5000

# Process A starts processing (slow)
sleep 10

# During sleep, lock expires

# Process B: Get token 2
TOKEN_B=$(redis-cli INCR "fence:order:123")
echo "Process B token: $TOKEN_B"  # 2

# Process B acquires lock
redis-cli SET "lock:order:123" "process-b" NX PX 5000

# Process B writes with token 2
curl -X POST http://localhost:3000/api/orders/123 \
  -H "X-Fence-Token: 2" \
  -d '{"status": "completed"}'
# Success

# Process A wakes up and tries to write with token 1
curl -X POST http://localhost:3000/api/orders/123 \
  -H "X-Fence-Token: 1" \
  -d '{"status": "processing"}'
# Response: 409 Conflict - Stale token rejected!

# Code implementation
async function writeWithToken(orderId, data, token) {
  const currentToken = await redis.get(`fence:order:${orderId}`);
  
  if (parseInt(token) < parseInt(currentToken)) {
    throw new Error('Stale write rejected');
  }
  
  await database.save(data);
}
```

### Demo 5: PostgreSQL Advisory Locks

**Công nghệ:** PostgreSQL pg_advisory_lock

**Cách triển khai:**
- PostgreSQL có built-in advisory locks: pg_advisory_lock(key)
- Locks được giữ trong database session, tự động release khi connection đóng
- Khác với row locks (lock data), advisory locks lock arbitrary resources
- Mỗi lock có ID (integer), processes tranh nhau acquire cùng ID
- Blocking call: đợi cho đến khi acquire được
- Non-blocking: pg_try_advisory_lock - return ngay true/false
- Giống như khóa database nhưng không khóa data cụ thể, khóa "ý tưởng"

**Cách test:**
```bash
# Session 1: Acquire lock
psql -U postgres -d mydb << EOF
SELECT pg_advisory_lock(123);
-- Acquired
SELECT pg_sleep(10);  -- Hold for 10 seconds
SELECT pg_advisory_unlock(123);
EOF

# Session 2: Try acquire same lock (blocks)
psql -U postgres -d mydb << EOF
SELECT pg_advisory_lock(123);
-- Waits until session 1 releases
-- Then acquires
EOF

# Non-blocking version
psql -U postgres -d mydb << EOF
SELECT pg_try_advisory_lock(123);
-- Returns: false (if locked)
-- Returns: true (if acquired)
EOF

# Code usage
async function processOrder(orderId) {
  const lockId = hashStringToInt(orderId);
  
  await queryRunner.query('SELECT pg_advisory_lock($1)', [lockId]);
  
  try {
    // Critical section
    const order = await getOrder(orderId);
    await processOrder(order);
  } finally {
    await queryRunner.query('SELECT pg_advisory_unlock($1)', [lockId]);
  }
}

# Test from multiple processes
node process-order.js order-1 &
node process-order.js order-1 &
# Second process waits for first to complete
```

### Demo 6: Database Row-Level Locks - SELECT FOR UPDATE

**Công nghệ:** SQL SELECT FOR UPDATE

**Cách triển khai:**
- Lock specific row trong database khi đọc
- Các transactions khác không thể read hoặc update row đó
- Lock tự động release khi transaction commit/rollback
- Đảm bảo serializable isolation level
- Chỉ lock row cần thiết, không lock toàn bộ table
- Pessimistic locking: lock trước khi xử lý
- Giống như đặt biển "Đang sửa chữa" trên row

**Cách test:**
```bash
# Transaction 1: Lock row
psql -U postgres -d mydb << EOF
BEGIN;
SELECT * FROM orders WHERE id = 123 FOR UPDATE;
-- Row locked
SELECT pg_sleep(10);
-- Still holding lock
COMMIT;
-- Lock released
EOF

# Transaction 2: Try access same row (blocks)
psql -U postgres -d mydb << EOF
BEGIN;
SELECT * FROM orders WHERE id = 123 FOR UPDATE;
-- Waits for transaction 1 to commit
-- Then acquires lock
UPDATE orders SET status = 'completed' WHERE id = 123;
COMMIT;
EOF

# Code with TypeORM
async function processOrder(orderId) {
  const queryRunner = dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();
  
  try {
    // Lock row
    const order = await queryRunner.manager
      .createQueryBuilder(Order, 'order')
      .setLock('pessimistic_write')
      .where('order.id = :id', { id: orderId })
      .getOne();
    
    // Process safely
    order.status = 'processing';
    await queryRunner.manager.save(order);
    
    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}

# Test concurrent updates
for i in {1..5}; do
  curl -X PATCH http://localhost:3000/api/orders/123 \
    -d '{"status": "completed"}' &
done
# Executed serially, no race condition
```

### Demo 7: Lock with Retry and Backoff

**Công nghệ:** Exponential backoff, retry logic

**Cách triển khai:**
- Khi acquire lock fail, không bỏ cuộc ngay mà retry
- Retry với exponential backoff: chờ 100ms, 200ms, 400ms, 800ms...
- Tránh thundering herd: nhiều processes cùng retry cùng lúc
- Thêm jitter (random delay) để spread out retries
- Đặt max retries để không retry mãi mãi
- Return error sau khi hết retries
- Giống như gọi điện bận, đợi lâu dần trước khi gọi lại

**Cách test:**
```bash
# Lock with retry logic
async function acquireLockWithRetry(key, maxRetries = 5) {
  for (let i = 0; i < maxRetries; i++) {
    const acquired = await redis.set(key, 'worker', 'NX', 'PX', 5000);
    
    if (acquired) {
      console.log(`Lock acquired on attempt ${i + 1}`);
      return true;
    }
    
    // Exponential backoff with jitter
    const baseDelay = Math.pow(2, i) * 100;
    const jitter = Math.random() * 100;
    const delay = baseDelay + jitter;
    
    console.log(`Retry ${i + 1} after ${delay}ms`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  
  throw new Error('Failed to acquire lock after retries');
}

# Test contention
for i in {1..10}; do
  node -e "
    const acquireLockWithRetry = require('./lock');
    acquireLockWithRetry('lock:resource').then(() => {
      console.log('Process $i acquired lock');
    });
  " &
done

# Output:
# Lock acquired on attempt 1
# Retry 1 after 120ms
# Retry 2 after 350ms
# Lock acquired on attempt 3
# Retry 1 after 105ms
# Lock acquired on attempt 2
# ...
```

### Demo 8: Redlock Algorithm - Multi-Redis

**Công nghệ:** Redlock, multiple Redis instances

**Cách triển khai:**
- Chạy nhiều Redis instances độc lập (ví dụ: 5 instances)
- Acquire lock từ MAJORITY (> N/2) instances
- Nếu acquire được 3/5, lock thành công
- Nếu chỉ 2/5, lock thất bại, release các locks đã có
- TTL phải consistent across all instances
- Tránh single point of failure: 1-2 Redis down vẫn hoạt động
- Giống như bầu cử: phải có quá bán phiếu mới thắng

**Cách test:**
```bash
# Setup 5 Redis instances
docker run -d -p 6379:6379 redis:7 --name redis-1
docker run -d -p 6380:6379 redis:7 --name redis-2
docker run -d -p 6381:6379 redis:7 --name redis-3
docker run -d -p 6382:6379 redis:7 --name redis-4
docker run -d -p 6383:6379 redis:7 --name redis-5

# Install redlock
npm install redlock

# Code
const Redlock = require('redlock');
const Redis = require('ioredis');

const redlock = new Redlock(
  [
    new Redis({ port: 6379 }),
    new Redis({ port: 6380 }),
    new Redis({ port: 6381 }),
    new Redis({ port: 6382 }),
    new Redis({ port: 6383 }),
  ],
  {
    driftFactor: 0.01,
    retryCount: 3,
    retryDelay: 200,
    retryJitter: 200,
  }
);

# Acquire lock
const lock = await redlock.acquire(['lock:order:123'], 5000);

try {
  // Critical section
  await processOrder();
} finally {
  await lock.release();
}

# Test with Redis failures
docker stop redis-2
docker stop redis-4

# Still works (3/5 healthy)
curl -X POST http://localhost:3000/api/orders
# Success

docker stop redis-3

# Now fails (only 2/5 healthy)
curl -X POST http://localhost:3000/api/orders
# Error: Unable to acquire lock
```

### Demo 9: Lock Queue - Fair Ordering

**Công nghệ:** Redis List, BLPOP

**Cách triển khai:**
- Thay vì tranh nhau acquire lock (unfair), xếp hàng (queue)
- Process muốn lock thì push ID vào Redis List
- BLPOP để block và chờ đến lượt (FIFO order)
- Khi xong, process tiếp theo tự động được unblock
- Đảm bảo fairness: ai đến trước được xử lý trước
- Không có starvation: tất cả đều được xử lý
- Giống như lấy số thứ tự ở ngân hàng

**Cách test:**
```bash
# Lock queue implementation
class LockQueue {
  async acquire(resource, processId) {
    // Add to queue
    await redis.rpush(`queue:${resource}`, processId);
    
    // Wait for turn (blocking pop from front)
    while (true) {
      const front = await redis.lindex(`queue:${resource}`, 0);
      
      if (front === processId) {
        // My turn!
        return true;
      }
      
      // Wait
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  async release(resource) {
    // Remove from front (my turn is done)
    await redis.lpop(`queue:${resource}`);
  }
}

# Test with multiple processes
for i in {1..5}; do
  node -e "
    const queue = new LockQueue();
    const processId = 'process-$i';
    
    (async () => {
      console.log('Process $i: Joining queue');
      await queue.acquire('resource', processId);
      
      console.log('Process $i: Got lock');
      await new Promise(r => setTimeout(r, 2000));
      
      console.log('Process $i: Releasing');
      await queue.release('resource');
    })();
  " &
done

# Output (ordered):
# Process 1: Joining queue
# Process 2: Joining queue
# Process 3: Joining queue
# Process 1: Got lock
# Process 1: Releasing
# Process 2: Got lock
# Process 2: Releasing
# Process 3: Got lock
# ...
```

### Demo 10: Optimistic Locking với Version Field

**Công nghệ:** Database version field, compare-and-swap

**Cách triển khai:**
- Thêm column "version" vào table (tăng mỗi lần update)
- Đọc row cùng với version hiện tại
- Xử lý business logic
- Update row CHỈ NẾU version chưa thay đổi: `UPDATE ... WHERE id = ? AND version = ?`
- Nếu version đã thay đổi (ai đó update trước), update fail
- Retry transaction với version mới
- Optimistic: giả sử ít conflict, check khi commit
- Giống như chỉnh sửa Google Docs: save thành công nếu chưa ai sửa, không thì báo conflict

**Cách test:**
```bash
# Database schema
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  amount DECIMAL(10,2),
  status VARCHAR(50),
  version INTEGER DEFAULT 1
);

# Optimistic lock code
async function updateOrder(orderId, newStatus) {
  const maxRetries = 3;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Read with version
    const order = await db.query(
      'SELECT * FROM orders WHERE id = $1',
      [orderId]
    );
    
    const currentVersion = order.version;
    
    // Process
    // ... business logic ...
    
    // Update with version check
    const result = await db.query(
      'UPDATE orders SET status = $1, version = version + 1 WHERE id = $2 AND version = $3',
      [newStatus, orderId, currentVersion]
    );
    
    if (result.rowCount === 1) {
      console.log(`Update succeeded on attempt ${attempt + 1}`);
      return;
    }
    
    console.log(`Version conflict, retry ${attempt + 1}`);
  }
  
  throw new Error('Failed after retries due to conflicts');
}

# Test concurrent updates
for i in {1..5}; do
  curl -X PATCH http://localhost:3000/api/orders/123 \
    -d '{"status": "completed"}' &
done

# Output:
# Process 1: Update succeeded on attempt 1
# Process 2: Version conflict, retry 1
# Process 2: Update succeeded on attempt 2
# Process 3: Version conflict, retry 1
# Process 3: Version conflict, retry 2
# Process 3: Update succeeded on attempt 3
# ...

# Check final version
SELECT version FROM orders WHERE id = 123;
# version = 6 (initial 1 + 5 updates)
```

## Cách chạy các demo

### 1. Setup Redis

```bash
# Start Redis
docker run -d --name redis -p 6379:6379 redis:7

# Test connection
redis-cli PING
# Response: PONG
```

### 2. Setup PostgreSQL

```bash
# Start PostgreSQL
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=testdb \
  -p 5432:5432 \
  postgres:15

# Create test table
docker exec -it postgres psql -U postgres -d testdb << EOF
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  amount DECIMAL(10,2),
  status VARCHAR(50),
  version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO orders (user_id, amount, status) VALUES (1, 100.00, 'pending');
EOF
```

### 3. Test race condition without lock

```bash
# Start 2 instances
cd backend
node server.js --port 3000 &
node server.js --port 3001 &

# Initialize balance
curl -X POST http://localhost:3000/api/balance/init \
  -H "Content-Type: application/json" \
  -d '{"userId": 1, "amount": 1000}'

# Concurrent requests (race condition)
curl -X POST http://localhost:3000/api/deduct -d '{"userId": 1, "amount": 100}' &
curl -X POST http://localhost:3001/api/deduct -d '{"userId": 1, "amount": 100}' &

# Check result
curl http://localhost:3000/api/balance/1
# Expected: 800, Actual: 900 (race condition!)
```

### 4. Test with Redis lock

```bash
# Enable distributed lock
export USE_REDIS_LOCK=true

# Restart servers
killall node
node server.js --port 3000 &
node server.js --port 3001 &

# Reset balance
curl -X POST http://localhost:3000/api/balance/init -d '{"userId": 1, "amount": 1000}'

# Concurrent requests (with lock)
curl -X POST http://localhost:3000/api/deduct -d '{"userId": 1, "amount": 100}' &
curl -X POST http://localhost:3001/api/deduct -d '{"userId": 1, "amount": 100}' &

# Check result
curl http://localhost:3000/api/balance/1
# Result: 800 (correct!)
```

### 5. Test fenced tokens

```bash
# Enable fenced tokens
export USE_FENCED_TOKENS=true

# Simulate slow process
curl -X POST http://localhost:3000/api/order/123 \
  -H "X-Simulate-Delay: 10000" \
  -d '{"status": "processing"}' &

# Quick process gets newer token
sleep 2
curl -X POST http://localhost:3001/api/order/123 \
  -d '{"status": "completed"}'

# Slow process tries to write (will be rejected)
# Output: "Stale write rejected - token outdated"
```

### 6. Monitor locks

```bash
# Redis monitor
redis-cli MONITOR | grep lock

# Check active locks
redis-cli KEYS "lock:*"

# Check lock details
redis-cli GET "lock:order:123"
redis-cli TTL "lock:order:123"

# Check fenced tokens
redis-cli GET "fence:order:123"
```

### 7. Test PostgreSQL advisory locks

```bash
# Code test
node -e "
const { Client } = require('pg');

(async () => {
  const client = new Client({
    host: 'localhost',
    database: 'testdb',
    user: 'postgres',
    password: 'password'
  });
  
  await client.connect();
  
  console.log('Acquiring lock 123...');
  await client.query('SELECT pg_advisory_lock(123)');
  
  console.log('Lock acquired, sleeping 5s');
  await new Promise(r => setTimeout(r, 5000));
  
  await client.query('SELECT pg_advisory_unlock(123)');
  console.log('Lock released');
  
  await client.end();
})();
"

# Run 2 processes
node test-advisory.js &
node test-advisory.js &

# Second process waits for first
```

### 8. Load testing with locks

```bash
# Install tool
npm install -g artillery

# Create test config
cat > load-test.yml << EOF
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 50
scenarios:
  - flow:
    - post:
        url: '/api/orders'
        json:
          userId: 1
          amount: 100
EOF

# Run test
artillery run load-test.yml

# Monitor
watch -n 1 'redis-cli INFO stats | grep total_commands'
watch -n 1 'redis-cli KEYS "lock:*" | wc -l'
```

### 9. Test lock expiration

```bash
# Acquire lock
redis-cli SET "lock:test" "worker-1" NX PX 5000

# Monitor TTL
watch -n 1 'redis-cli TTL lock:test'

# After 5 seconds, lock expires
redis-cli GET "lock:test"
# Response: (nil)
```

### 10. Benchmark lock overhead

```bash
# Without lock
time node -e "
for (let i = 0; i < 1000; i++) {
  await db.query('SELECT 1');
}
"
# ~200ms

# With Redis lock
time node -e "
for (let i = 0; i < 1000; i++) {
  const lock = await redis.set('lock', 'v', 'NX', 'PX', 1000);
  await db.query('SELECT 1');
  await redis.del('lock');
}
"
# ~350ms (175% of original - acceptable overhead)
```

## Tài liệu tham khảo

- [Redlock: Distributed locks with Redis](https://redis.io/docs/manual/patterns/distributed-locks/)
- [PostgreSQL Advisory Locks](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS)
- [Fenced Tokens - Martin Kleppmann](https://martin.kleppmann.com/2016/02/08/how-to-do-distributed-locking.html)
- [Designing Data-Intensive Applications](https://dataintensive.net/)
- [Distributed Locks with Redis - RedisLabs](https://redislabs.com/ebook/part-2-core-concepts/chapter-6-application-components-in-redis/6-2-distributed-locking/)
- [Database Locking Strategies](https://www.postgresql.org/docs/current/mvcc.html)

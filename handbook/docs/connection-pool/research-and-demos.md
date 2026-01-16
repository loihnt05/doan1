# Research và Demos về Connection Pool

## Tổng quan

Các demo về Connection Pool bao gồm quản lý kết nối database, connection pooling strategies, resource management, health checks, và performance optimization.

## Công nghệ sử dụng

- **pg-pool (PostgreSQL)**: Connection pooling cho PostgreSQL
- **mysql2/promise**: MySQL connection pool
- **mongodb**: MongoDB connection pool
- **redis**: Redis connection pool
- **generic-pool**: Generic pooling library
- **Sequelize/TypeORM**: ORM với built-in pooling
- **Custom Pool Manager**: Tự implement connection pool

## Các Demo

### Demo 1: Basic Connection Pool Setup

**Công nghệ:** pg-pool, PostgreSQL

**Cách triển khai:**
- Thay vì tạo kết nối mới mỗi lần query, tạo một pool chứa sẵn nhiều kết nối
- Khi cần query, lấy (acquire) một kết nối từ pool
- Sau khi xong, trả (release) kết nối về pool để người khác dùng
- Pool tự động quản lý số lượng kết nối: min (tối thiểu luôn có), max (tối đa không vượt quá)
- Tiết kiệm thời gian không phải tạo kết nối mới (tốn 50-100ms) mỗi lần
- Giống như thuê xe: có sẵn bãi xe, lấy xe dùng rồi trả lại, không phải mua xe mới mỗi lần đi

**Cách test:**
```bash
# Setup pool
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'mydb',
  user: 'postgres',
  password: 'password',
  min: 2,        // Tối thiểu 2 kết nối luôn có sẵn
  max: 10,       // Tối đa 10 kết nối
});

# Test query với pool
node -e "
const pool = require('./pool');
(async () => {
  const start = Date.now();
  const result = await pool.query('SELECT NOW()');
  console.log('Query time:', Date.now() - start, 'ms');
  console.log('Result:', result.rows[0]);
})();
"

# So sánh: Query đầu tiên ~50ms (tạo connection)
# Queries tiếp theo ~5ms (dùng connection có sẵn)
```

### Demo 2: Connection Pool Sizing

**Công nghệ:** Calculation formula, monitoring

**Cách triển khai:**
- Xác định pool size tối ưu dựa trên công thức: connections = (core_count × 2) + effective_spindle_count
- Cho web app: thường 10-20 connections là đủ
- Quá ít: requests phải chờ lâu (queue buildup)
- Quá nhiều: tốn RAM, database overload, context switching
- Monitor và điều chỉnh dựa trên metrics: wait time, utilization, throughput
- Giống như số quầy thu ngân: ít quá khách xếp hàng dài, nhiều quá lãng phí nhân viên

**Cách test:**
```bash
# Test với pool size khác nhau
# Pool size = 5
const pool5 = new Pool({ min: 2, max: 5 });

# Pool size = 20
const pool20 = new Pool({ min: 5, max: 20 });

# Load test
npm install -g autocannon

# Test pool 5
autocannon -c 50 -d 10 http://localhost:3000/api/users
# Output: Avg latency: 150ms, Req/sec: 300

# Test pool 20
autocannon -c 50 -d 10 http://localhost:3000/api/users
# Output: Avg latency: 50ms, Req/sec: 900

# Test pool 100 (quá nhiều)
autocannon -c 50 -d 10 http://localhost:3000/api/users
# Output: Avg latency: 80ms, Req/sec: 600 (kém hơn pool 20)

# Kết luận: Pool 20 là optimal
```

### Demo 3: Connection Timeout và Retry

**Công nghệ:** Pool configuration, error handling

**Cách triển khai:**
- Đặt timeout cho việc lấy connection từ pool (connectionTimeoutMillis)
- Nếu tất cả connections đang bận và timeout, throw error
- Đặt timeout cho query execution (statement_timeout)
- Retry logic: nếu query fail vì timeout hoặc connection error, thử lại vài lần
- Exponential backoff: retry lần 1 sau 100ms, lần 2 sau 200ms, lần 3 sau 400ms
- Giống như gọi điện: không ai nghe máy thì đợi chút rồi gọi lại

**Cách test:**
```bash
# Cấu hình pool với timeouts
const pool = new Pool({
  connectionTimeoutMillis: 5000,  // 5s để acquire connection
  query_timeout: 10000,            // 10s để execute query
  max: 5
});

# Giả lập tất cả connections bận
async function simulateBusy() {
  const clients = [];
  
  // Acquire tất cả 5 connections
  for (let i = 0; i < 5; i++) {
    const client = await pool.connect();
    clients.push(client);
    // Giữ connections không release
  }
  
  // Request thứ 6 sẽ timeout
  try {
    await pool.query('SELECT 1');
  } catch (error) {
    console.log('Expected timeout:', error.message);
    // "timeout: could not acquire connection"
  }
  
  // Release connections
  clients.forEach(c => c.release());
}

# Test retry logic
async function queryWithRetry(sql, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await pool.query(sql);
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      const delay = Math.pow(2, i) * 100;
      console.log(`Retry ${i + 1} after ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Demo 4: Idle Connection Management

**Công nghệ:** Pool idle timeout, reaper

**Cách triển khai:**
- Connections không dùng lâu (idle) sẽ tốn RAM database
- Đặt idleTimeoutMillis: sau thời gian này, connection idle sẽ bị đóng
- Pool sẽ dọn dẹp (reap) connections idle, nhưng giữ lại số min connections
- Khi cần lại, pool tạo connection mới (lazy creation)
- Cân bằng giữa performance (có sẵn connections) và resource usage (không lãng phí)
- Giống như tắt đèn phòng không dùng để tiết kiệm điện

**Cách test:**
```bash
# Pool với idle timeout
const pool = new Pool({
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000,  // 30 giây
});

# Giả lập high load
console.log('Simulating high load...');
for (let i = 0; i < 100; i++) {
  await pool.query('SELECT 1');
}

# Check pool stats
console.log('Pool size:', pool.totalCount);  # 10 (scaled up)
console.log('Idle:', pool.idleCount);        # 10

# Chờ 35 giây (idle timeout)
await new Promise(resolve => setTimeout(resolve, 35000));

# Check lại
console.log('Pool size after timeout:', pool.totalCount);  # 2 (scaled down to min)
console.log('Idle:', pool.idleCount);                      # 2

# Connections đã được dọn dẹp, chỉ còn min connections
```

### Demo 5: Connection Health Checks

**Công nghệ:** pg Pool, health check queries

**Cách triển khai:**
- Định kỳ kiểm tra connections có còn sống không (heartbeat)
- Gửi query đơn giản như SELECT 1 để test
- Nếu connection fail (network error, database restart), đánh dấu là bad
- Loại bỏ bad connections khỏi pool và tạo mới
- Tránh lấy phải connection đã chết để xử lý request
- Giống như kiểm tra sức khỏe định kỳ, phát hiện bệnh sớm

**Cách test:**
```bash
# Health check implementation
class HealthCheckedPool {
  constructor(pool) {
    this.pool = pool;
    this.startHealthCheck();
  }
  
  startHealthCheck() {
    setInterval(async () => {
      console.log('Running health check...');
      
      const client = await this.pool.connect();
      try {
        await client.query('SELECT 1');
        console.log('Health check: OK');
      } catch (error) {
        console.log('Health check: FAILED', error.message);
        client.release(true);  // Destroy bad connection
      } finally {
        client.release();
      }
    }, 10000);  // Every 10 seconds
  }
}

# Test với database bị ngắt
const pool = new Pool({ max: 5 });
const healthPool = new HealthCheckedPool(pool);

# Sau 10s: "Health check: OK"
# Tắt database
docker stop postgres

# Sau 10s: "Health check: FAILED"
# Bad connection được loại bỏ

# Start lại database
docker start postgres

# Sau 10s: "Health check: OK"
# New healthy connection được tạo
```

### Demo 6: Transaction Management với Pool

**Công nghệ:** pg Pool, BEGIN/COMMIT/ROLLBACK

**Cách triển khai:**
- Transaction cần sử dụng cùng 1 connection từ đầu đến cuối
- Acquire connection, BEGIN transaction
- Thực hiện nhiều queries trong transaction
- COMMIT nếu thành công, ROLLBACK nếu lỗi
- Luôn release connection trong finally block
- Không để connection bị stuck nếu có lỗi
- Giống như giao dịch ngân hàng: hoặc tất cả thành công, hoặc không có gì thay đổi

**Cách test:**
```bash
# Transaction helper
async function withTransaction(pool, callback) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

# Test successful transaction
await withTransaction(pool, async (client) => {
  await client.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);
  await client.query('INSERT INTO accounts (user_id, balance) VALUES ($1, $2)', [1, 1000]);
});

# Check data
await pool.query('SELECT * FROM users');
await pool.query('SELECT * FROM accounts');
# Both inserts succeeded

# Test failed transaction
try {
  await withTransaction(pool, async (client) => {
    await client.query('INSERT INTO users (name) VALUES ($1)', ['Bob']);
    await client.query('INSERT INTO accounts (user_id, balance) VALUES ($1, $2)', [999, 1000]);
    // Lỗi: user_id 999 không tồn tại (foreign key constraint)
  });
} catch (error) {
  console.log('Transaction rolled back');
}

# Check data
await pool.query('SELECT * FROM users WHERE name = $1', ['Bob']);
# Empty result - rollback successful
```

### Demo 7: Connection Pool Monitoring và Metrics

**Công nghệ:** Pool stats, Prometheus, custom metrics

**Cách triển khai:**
- Theo dõi metrics quan trọng của pool:
  - Total connections: tổng số connections hiện tại
  - Idle connections: số connections đang rảnh
  - Active connections: số connections đang xử lý
  - Waiting requests: số requests đang chờ connection
  - Avg wait time: thời gian trung bình phải chờ
- Expose metrics qua /metrics endpoint cho Prometheus
- Alert khi pool gần đầy (utilization > 80%)
- Giống như bảng điều khiển xe: biết tốc độ, nhiên liệu, nhiệt độ

**Cách test:**
```bash
# Pool metrics collector
class PoolMetrics {
  constructor(pool) {
    this.pool = pool;
    this.waitTimes = [];
  }
  
  getMetrics() {
    return {
      totalConnections: this.pool.totalCount,
      idleConnections: this.pool.idleCount,
      activeConnections: this.pool.totalCount - this.pool.idleCount,
      waitingRequests: this.pool.waitingCount,
      avgWaitTime: this.calculateAvgWaitTime(),
      utilization: ((this.pool.totalCount - this.pool.idleCount) / this.pool.totalCount * 100).toFixed(1)
    };
  }
  
  recordWaitTime(duration) {
    this.waitTimes.push(duration);
    if (this.waitTimes.length > 100) {
      this.waitTimes.shift();
    }
  }
  
  calculateAvgWaitTime() {
    if (this.waitTimes.length === 0) return 0;
    return this.waitTimes.reduce((a, b) => a + b, 0) / this.waitTimes.length;
  }
}

# Expose metrics endpoint
app.get('/metrics', (req, res) => {
  const metrics = poolMetrics.getMetrics();
  res.json(metrics);
});

# Test monitoring
curl http://localhost:3000/metrics
# Response:
# {
#   "totalConnections": 8,
#   "idleConnections": 3,
#   "activeConnections": 5,
#   "waitingRequests": 2,
#   "avgWaitTime": 15.5,
#   "utilization": "62.5"
# }

# Set up alert
if (metrics.utilization > 80) {
  console.log('⚠️ WARNING: Pool utilization high!');
  // Send alert to monitoring system
}
```

### Demo 8: Connection Pool per Service (Microservices)

**Công nghệ:** Multiple pools, service isolation

**Cách triển khai:**
- Mỗi microservice có pool riêng, không share
- Service A có pool A, Service B có pool B
- Tránh một service ăn hết connections của service khác
- Mỗi pool có config riêng tùy vào workload của service
- Service quan trọng (payment) có pool size lớn hơn service ít dùng (analytics)
- Isolation: lỗi pool service A không ảnh hưởng service B
- Giống như mỗi phòng ban có ngân sách riêng

**Cách test:**
```bash
# Service A (high priority)
const paymentPool = new Pool({
  host: 'db-host',
  database: 'payments',
  min: 5,
  max: 20,
  user: 'payment_service'
});

# Service B (low priority)
const analyticsPool = new Pool({
  host: 'db-host',
  database: 'analytics',
  min: 2,
  max: 5,
  user: 'analytics_service'
});

# Load test payment service
for (let i = 0; i < 100; i++) {
  paymentPool.query('INSERT INTO payments ...');
}

# Check pools
console.log('Payment pool:', paymentPool.totalCount);    # Scaled to 20
console.log('Analytics pool:', analyticsPool.totalCount); # Still 2

# Payment service không ảnh hưởng analytics pool
# Analytics vẫn có connections available
```

### Demo 9: Connection Pool với Read Replicas

**Công nghệ:** Master-slave replication, read/write splitting

**Cách triển khai:**
- Có 1 master database (write) và nhiều replica databases (read)
- Tạo 2 pools: write pool (master) và read pool (replicas)
- Write queries (INSERT, UPDATE, DELETE) → write pool
- Read queries (SELECT) → read pool
- Read pool có thể lớn hơn vì reads nhiều hơn writes
- Load balancing giữa replicas để phân tải reads
- Giống như có 1 người ghi sổ chính và nhiều người photocopy cho mượn

**Cách test:**
```bash
# Write pool (master)
const writePool = new Pool({
  host: 'db-master',
  port: 5432,
  min: 5,
  max: 10
});

# Read pool (replicas)
const readPool = new Pool({
  host: 'db-replica-1,db-replica-2,db-replica-3',
  port: 5432,
  min: 10,
  max: 30,
  loadBalanceHosts: true
});

# Write query
await writePool.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);

# Read queries (distributed across replicas)
await readPool.query('SELECT * FROM users');         # → replica-1
await readPool.query('SELECT * FROM orders');        # → replica-2
await readPool.query('SELECT * FROM products');      # → replica-3

# Monitor utilization
console.log('Write pool:', writePool.totalCount);  # 6
console.log('Read pool:', readPool.totalCount);    # 25

# Read pool scaled up more because more read traffic
```

### Demo 10: Generic Pool - Pooling Any Resource

**Công nghệ:** generic-pool library

**Cách triển khai:**
- generic-pool không chỉ cho database, có thể pool bất kỳ resource nào
- Ví dụ: pool HTTP clients, Redis connections, file handles, worker threads
- Định nghĩa cách tạo (create) và hủy (destroy) resource
- Định nghĩa cách validate resource (health check)
- Pool tự động quản lý lifecycle: create, reuse, destroy
- Dùng khi có resource tốn kém để tạo và có thể tái sử dụng
- Giống như cho thuê bất kỳ thứ gì: xe, nhà, thiết bị

**Cách test:**
```bash
# Install generic-pool
npm install generic-pool

# Pool HTTP clients
const genericPool = require('generic-pool');
const axios = require('axios');

const httpClientPool = genericPool.createPool({
  create: async () => {
    console.log('Creating new HTTP client...');
    return axios.create({
      baseURL: 'https://api.example.com',
      timeout: 5000
    });
  },
  
  destroy: async (client) => {
    console.log('Destroying HTTP client...');
    // Cleanup if needed
  },
  
  validate: async (client) => {
    // Check if client still works
    try {
      await client.get('/health');
      return true;
    } catch {
      return false;
    }
  }
}, {
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000
});

# Use pool
async function makeRequest(url) {
  const client = await httpClientPool.acquire();
  
  try {
    const response = await client.get(url);
    return response.data;
  } finally {
    await httpClientPool.release(client);
  }
}

# Test
await makeRequest('/users');
await makeRequest('/orders');
await makeRequest('/products');

# Monitor
console.log('Pool size:', httpClientPool.size);
console.log('Available:', httpClientPool.available);
console.log('Borrowed:', httpClientPool.borrowed);
```

## Cách chạy các demo

### 1. Setup PostgreSQL

```bash
# Start PostgreSQL với Docker
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=testdb \
  -p 5432:5432 \
  postgres:15

# Verify connection
docker exec -it postgres psql -U postgres -d testdb -c "SELECT version();"
```

### 2. Setup project

```bash
cd backend
npm install pg generic-pool

# Tạo test database schema
docker exec -it postgres psql -U postgres -d testdb << EOF
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE accounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  balance DECIMAL(10,2)
);
EOF
```

### 3. Test basic pool

```bash
# Create pool.js
cat > pool.js << 'EOF'
const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'testdb',
  user: 'postgres',
  password: 'password',
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

module.exports = pool;
EOF

# Test query
node -e "
const pool = require('./pool');
(async () => {
  const result = await pool.query('SELECT NOW()');
  console.log('Current time:', result.rows[0].now);
  await pool.end();
})();
"
```

### 4. Monitor pool metrics

```bash
# Create monitoring script
node -e "
const pool = require('./pool');

setInterval(async () => {
  console.log('=== Pool Stats ===');
  console.log('Total:', pool.totalCount);
  console.log('Idle:', pool.idleCount);
  console.log('Waiting:', pool.waitingCount);
  console.log('');
}, 2000);
" &

# Run queries trong terminal khác
for i in {1..20}; do
  node -e "const pool = require('./pool'); pool.query('SELECT pg_sleep(2)');" &
done
```

### 5. Load testing

```bash
# Install load testing tool
npm install -g autocannon

# Start test API server
node server.js &

# Run load test
autocannon -c 100 -d 30 http://localhost:3000/api/users

# Results:
# Latency
#   Avg: 45ms
#   Max: 250ms
# Req/Sec
#   Avg: 2200
#   Total: 66000
```

### 6. Test connection leak detection

```bash
# Monitor for leaks
node -e "
const pool = require('./pool');

async function leak() {
  // Acquire but never release
  const client = await pool.connect();
  await client.query('SELECT 1');
  // Missing: client.release();
}

// Run leak 10 times
for (let i = 0; i < 10; i++) {
  leak();
}

// Check pool
setTimeout(() => {
  console.log('Total:', pool.totalCount);
  console.log('Idle:', pool.idleCount);
  console.log('Leaked:', pool.totalCount - pool.idleCount);
}, 5000);
"

# Output: 10 connections leaked (not returned to pool)
```

### 7. Test backpressure

```bash
# Create load beyond pool capacity
node -e "
const pool = require('./pool');

async function test() {
  const promises = [];
  
  // Create 50 concurrent requests (pool max = 10)
  for (let i = 0; i < 50; i++) {
    promises.push(
      pool.query('SELECT pg_sleep(5)')
        .then(() => console.log('Request', i, 'completed'))
        .catch(err => console.log('Request', i, 'timeout'))
    );
  }
  
  await Promise.allSettled(promises);
}

test();
"

# First 10 requests: immediate
# Next 40 requests: queued, may timeout
```

### 8. Test pool with replicas

```bash
# Setup master-replica
docker run -d --name postgres-master -p 5432:5432 postgres:15
docker run -d --name postgres-replica1 -p 5433:5432 postgres:15
docker run -d --name postgres-replica2 -p 5434:5432 postgres:15

# Configure replication (simplified)
# ... replication setup ...

# Test read distribution
node -e "
const readPool = new Pool({
  host: 'localhost',
  port: [5433, 5434],  // Replicas
  max: 20
});

for (let i = 0; i < 10; i++) {
  readPool.query('SELECT 1');
}
"
```

### 9. Benchmark pool vs no-pool

```bash
# Without pool
node -e "
const { Client } = require('pg');

async function withoutPool() {
  const start = Date.now();
  
  for (let i = 0; i < 100; i++) {
    const client = new Client({...});
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
  }
  
  console.log('Without pool:', Date.now() - start, 'ms');
}

withoutPool();
" 
# Result: ~8000ms

# With pool
node -e "
const pool = require('./pool');

async function withPool() {
  const start = Date.now();
  
  for (let i = 0; i < 100; i++) {
    await pool.query('SELECT 1');
  }
  
  console.log('With pool:', Date.now() - start, 'ms');
}

withPool();
"
# Result: ~200ms (40x faster!)
```

## Tài liệu tham khảo

- [node-postgres Pool](https://node-postgres.com/features/pooling)
- [MySQL2 Connection Pool](https://github.com/sidorares/node-mysql2#using-connection-pools)
- [generic-pool Documentation](https://github.com/coopernurse/node-pool)
- [Connection Pool Best Practices](https://www.cockroachlabs.com/docs/stable/connection-pooling.html)
- [HikariCP Performance](https://github.com/brettwooldridge/HikariCP/wiki/About-Pool-Sizing)
- [Database Connection Management - AWS](https://aws.amazon.com/blogs/database/resources-for-connection-pooling/)

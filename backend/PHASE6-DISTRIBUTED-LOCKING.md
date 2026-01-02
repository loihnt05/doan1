# PHASE 6: DISTRIBUTED LOCKING & RELIABILITY PATTERNS

## 🎯 Overview

Phase 6 addresses **the most critical challenges in distributed systems**: race conditions, data consistency, and reliability. This is essential knowledge for production-grade microservices.

### Why Distributed Locking?

**The Problem:**
```
2 API instances → both process same order → double payment ❌
```

**What You'll Learn:**
- Why local locks fail in distributed systems
- How to implement Redis-based distributed locks
- Redlock algorithm for high availability
- Fenced tokens to prevent stale writes
- Reliability patterns (retry, timeout, bulkhead)
- When to use which locking strategy

---

## 📊 The Race Condition Problem

### Scenario: Payment Processing

```typescript
let balance = 1000;

@Post('/pay')
async processPayment() {
  // Read balance
  const current = balance; // 1000
  
  // Check if sufficient funds
  if (current >= 100) {
    // Deduct amount
    balance = current - 100; // 900
    return 'Payment successful';
  }
}
```

**What happens with 2 concurrent requests?**

```
Time  Request A          Request B          Balance
────────────────────────────────────────────────────
T1    Read: 1000                            1000
T2                       Read: 1000         1000
T3    Check: 1000 >= 100                    1000
T4                       Check: 1000 >= 100 1000
T5    Write: 900                            900
T6                       Write: 900         900  ← WRONG!
```

**Expected: $800**  
**Actual: $900**  
**Lost: $100** ❌

This is a **check-then-act race condition**.

---

## 🔒 Solution 1: In-Memory Lock (BAD for Distributed)

```typescript
let locked = false;

async processPayment() {
  // Try to acquire lock
  if (locked) {
    return 'Resource busy';
  }
  
  locked = true;
  
  try {
    // Critical section
    balance -= 100;
  } finally {
    locked = false;
  }
}
```

**Why this fails:**

❌ **Multiple instances**: Lock only works within single process  
❌ **Process restart**: Lock state lost  
❌ **Not distributed**: Each instance has its own `locked` variable

```
Instance 1: locked = true  → processes
Instance 2: locked = false → also processes ❌
```

---

## 🔒 Solution 2: Redis Distributed Lock

### How It Works

Redis provides atomic operations:

```redis
SET lock:order:123 worker-1 NX PX 5000
```

**Explanation:**
- `NX`: Only set if key doesn't exist (atomic check-and-set)
- `PX 5000`: Set TTL of 5000ms (auto-expire if worker crashes)
- Returns `OK` if lock acquired, `null` if already held

### Implementation

**libs/distributed-lock/distributed-lock.service.ts:**

```typescript
export class DistributedLockService {
  async acquire(key: string, ttlMs: number = 5000): Promise<string | null> {
    const owner = this.generateOwner(); // unique ID
    
    // Atomic: set if not exists + TTL
    const result = await this.redis.set(key, owner, 'PX', ttlMs, 'NX');
    
    return result === 'OK' ? owner : null;
  }
  
  async release(key: string, owner: string): Promise<boolean> {
    // Use Lua script for atomic check-and-delete
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    
    const result = await this.redis.eval(script, 1, key, owner);
    return result === 1;
  }
}
```

**Why Lua script for release?**

Without Lua:
```typescript
// NOT ATOMIC - race condition possible!
const value = await redis.get(key);
if (value === owner) {
  await redis.del(key); // Another process could acquire lock here!
}
```

With Lua:
```typescript
// ATOMIC - entire script executes without interruption
await redis.eval(script, 1, key, owner);
```

### Usage Example

```typescript
async processPaymentWithLock() {
  const lockKey = 'lock:balance';
  const token = await this.lockService.acquire(lockKey, 5000);
  
  if (!token) {
    throw new Error('Could not acquire lock');
  }
  
  try {
    // Critical section - only one instance executes
    const current = this.balance;
    await this.sleep(50); // Simulate processing
    this.balance = current - 100;
    
  } finally {
    // Always release lock
    await this.lockService.release(lockKey, token);
  }
}
```

---

## 🔴 Redlock Algorithm

### The Problem with Single Redis

```
Redis Server ──✗ (crashes)
  ↓
All locks lost!
System down!
```

### Redlock Solution

Use **multiple independent Redis instances**:

```
Redis A ────┐
Redis B ────┼──→ Majority vote (2/3)
Redis C ────┘
```

### Algorithm Steps

```typescript
async acquireRedlock(key: string, ttl: number) {
  const servers = [redisA, redisB, redisC];
  const owner = generateToken();
  const startTime = Date.now();
  
  let successCount = 0;
  
  // 1. Try to acquire lock on all servers
  for (const redis of servers) {
    const success = await redis.set(key, owner, 'NX', 'PX', ttl);
    if (success) successCount++;
  }
  
  const elapsedTime = Date.now() - startTime;
  const remainingTtl = ttl - elapsedTime;
  
  // 2. Check if majority acquired AND enough time left
  if (successCount >= Math.floor(servers.length / 2) + 1 && remainingTtl > 0) {
    return owner; // Lock acquired!
  }
  
  // 3. Failed - release locks on all servers
  for (const redis of servers) {
    await redis.del(key);
  }
  
  return null;
}
```

### When to Use Redlock

✅ **Use Redlock when:**
- High availability is critical
- Can tolerate operational complexity
- Short critical sections (< 1 second)
- Financial transactions, inventory updates

❌ **Don't use Redlock when:**
- Single Redis is sufficient (most cases)
- Long-running operations (use lease extension)
- Strong consistency required (use Etcd/Zookeeper instead)

### Controversy

Martin Kleppmann (author of "Designing Data-Intensive Applications") argues Redlock is flawed:
- Clock drift can cause issues
- Process pause (GC) can violate safety
- Fenced tokens are necessary anyway

**Salvatore Sanfilippo (Redis creator) response:**
- Redlock is safe for most use cases
- Clock drift is manageable
- Use fenced tokens for critical operations

**Recommendation:** Use single Redis + fenced tokens for most cases.

---

## 🎫 Fenced Tokens (CRITICAL)

### The Problem: Lock Expiration

```
Time  Worker A                    Worker B
─────────────────────────────────────────────
T1    Acquire lock + process
T2    GC pause (Stop-the-world)
T3                                Lock expires
T4                                Acquire lock
T5                                Process + write
T6    Resume from GC pause
T7    Write ← STALE DATA! ❌
```

**Worker A writes stale data** even though it no longer holds the lock!

### Solution: Fenced Tokens

```typescript
// Token generation (monotonically increasing)
const token = await redis.incr('fence:order:123');
// Returns: 1, 2, 3, 4, 5, ...
```

**Flow:**

```
Time  Worker A              Worker B              Token   Storage
───────────────────────────────────────────────────────────────────
T1    Get token=1                                 1
T2    Acquire lock + process
T3    GC pause
T4                          Get token=2           2
T5                          Acquire lock
T6                          Process + write(2)    2       Write OK
T7    Resume, try write(1)                        2       Rejected ✅
```

**Storage validates token:**

```typescript
async write(data, token) {
  const currentToken = await redis.get('fence:order:123');
  
  if (token < currentToken) {
    throw new Error('Stale operation - rejected');
  }
  
  // Safe to write
  await db.save(data);
}
```

### Implementation

```typescript
async processOrderWithFencedToken(orderId: string) {
  const resource = `order:${orderId}`;
  
  // 1. Get fenced token (increments automatically)
  const fencedToken = await this.lockService.getFencedToken(resource);
  
  // 2. Acquire lock
  const lockToken = await this.lockService.acquire(`lock:${resource}`);
  if (!lockToken) throw new Error('Lock failed');
  
  try {
    // 3. Do processing (might be slow)
    await this.processOrder(orderId);
    
    // 4. Before writing, validate token
    const isValid = await this.lockService.validateFencedToken(resource, fencedToken);
    if (!isValid) {
      throw new Error('Stale operation - token outdated');
    }
    
    // 5. Safe to write
    await this.saveOrder(orderId);
    
  } finally {
    await this.lockService.release(`lock:${resource}`, lockToken);
  }
}
```

### Key Points

✅ **Token always increases** (Redis INCR is atomic)  
✅ **Storage rejects old tokens** (prevents stale writes)  
✅ **Works even if lock expires** (token validation catches it)  
✅ **Essential for financial systems**

---

## 🏗️ Consensus-Based Locks (Production Grade)

### Tools

| Tool | Algorithm | Consistency | Complexity |
|------|-----------|-------------|------------|
| **Zookeeper** | Zab (Paxos-like) | Linearizable | High |
| **Etcd** | Raft | Linearizable | Medium |
| **Consul** | Raft | Linearizable | Medium |

### How They Work

```
┌─────────────────────────────────────┐
│  Distributed Consensus Cluster       │
│                                     │
│  [Node 1] ←→ [Node 2] ←→ [Node 3]  │
│     ↓           ↓ (Leader)    ↓     │
└─────────────────────────────────────┘
        │
        │ Raft Consensus
        │
    Lock Service
```

**Features:**
- **Leader election**: One node is leader
- **Replicated log**: All nodes agree on lock state
- **Strong consistency**: Linearizable reads/writes
- **Failure detection**: Automatic leader failover

### Etcd Example

```typescript
import { Etcd3 } from 'etcd3';

const client = new Etcd3();

// Acquire lock with lease
const lease = client.lease(10); // 10 second TTL
await lease.grant();

const lock = await client.lock('my-resource')
  .ttl(10)
  .acquire();

try {
  // Critical section
  await processOrder();
} finally {
  await lock.release();
}
```

### When to Use

✅ **Use consensus-based locks when:**
- **Strong consistency** required (banking, inventory)
- **Leader election** needed
- **Configuration management** (service discovery)
- Can afford operational complexity

❌ **Use Redis locks when:**
- Best-effort locking sufficient
- Performance > consistency
- Simple operations
- Don't want operational overhead

---

## ⚡ Reliability Patterns

### 1. Timeout

```typescript
import { withTimeout } from '@app/reliability-patterns';

// Fail fast if operation takes > 1 second
const result = await withTimeout(
  fetchData(),
  1000,
  'Data fetch timeout'
);
```

**Why:**
- Prevent hanging operations
- Fail fast, retry sooner
- Avoid resource exhaustion

### 2. Retry with Exponential Backoff

```typescript
import { retry } from '@app/reliability-patterns';

const result = await retry(
  () => callExternalAPI(),
  {
    retries: 3,
    backoff: 1000,
    exponential: true,
    onRetry: (attempt, error) => {
      console.log(`Retry ${attempt}: ${error.message}`);
    }
  }
);
```

**Backoff progression:**
```
Attempt 1: Immediate
Attempt 2: 1000ms delay
Attempt 3: 2000ms delay
Attempt 4: 4000ms delay
```

### 3. Retry with Jitter

```typescript
import { retryWithJitter } from '@app/reliability-patterns';

// Randomized backoff prevents thundering herd
const result = await retryWithJitter(
  () => callAPI(),
  {
    retries: 5,
    baseDelay: 1000,
    maxDelay: 10000
  }
);
```

**Why jitter?**

Without jitter:
```
100 clients → all fail at same time
                 ↓
          all retry at T+1s
                 ↓
          server overloaded ❌
```

With jitter:
```
100 clients → all fail at same time
                 ↓
          retry spread over T+500ms to T+1500ms
                 ↓
          load distributed ✅
```

### 4. Bulkhead Pattern

```typescript
import { Bulkhead } from '@app/reliability-patterns';

const bulkhead = new Bulkhead(5); // Max 5 concurrent

// Limits concurrency
await bulkhead.execute(async () => {
  return await processItem(item);
});
```

**Why:**
- Prevent resource exhaustion
- Isolate failures
- Protect downstream services

### 5. Circuit Breaker (Recap from Phase 1)

```typescript
const breaker = circuitBreaker(callExternalAPI, {
  timeout: 3000,
  errorThresholdPercentage: 50,
  resetTimeout: 5000
});

// Fails fast if service is down
const result = await breaker.fire();
```

**States:**
```
Closed → Normal operation
  ↓ (50% errors)
Open → Reject all requests (fail fast)
  ↓ (after 5s)
Half-Open → Try one request
  ↓ (if success)
Closed → Back to normal
```

---

## 🎯 When to Use Which Lock

| Scenario | Solution | Trade-offs |
|----------|----------|------------|
| **Single instance** | In-memory lock | Simple, not distributed |
| **Small cluster, best-effort** | Redis lock | Fast, simple, may lose lock |
| **High availability** | Redlock (3+ Redis) | More complex, clock-sensitive |
| **Strong consistency** | Etcd/Zookeeper | Linearizable, operational overhead |
| **Prevent stale writes** | Fenced tokens | Essential for critical ops |
| **Short critical section** | Redis lock (< 1s) | Works well |
| **Long critical section** | Lease extension | Extend TTL periodically |
| **Leader election** | Etcd/Zookeeper | Built-in feature |
| **Financial transactions** | Etcd + fenced tokens | Maximum safety |

---

## 🧪 Testing

### Prerequisites

1. Start Redis:
```bash
docker-compose -f docker-compose.kafka.yml up redis -d
```

2. Start Order Service:
```bash
cd backend
PORT=3002 npm run start order-service
```

### Test 1: Race Condition Demo

```bash
./test-race-condition.sh
```

**What it does:**
1. Resets balance to $1000
2. Sends 10 concurrent requests WITHOUT lock ($100 each)
3. Shows incorrect balance (> $0)
4. Resets balance
5. Sends 10 concurrent requests WITH lock
6. Shows correct balance ($0)

**Expected output:**
```
Without Lock:
  Final Balance: $400 (Expected: $0)
  Lost: $400 ← RACE CONDITION!

With Lock:
  Final Balance: $0 (Expected: $0)
  Status: ✅ SAFE
```

### Test 2: Fenced Tokens

```bash
./test-fenced-tokens.sh
```

**What it does:**
1. Launches 3 concurrent workers
2. Each gets incrementing token (1, 2, 3)
3. All process same order
4. Only worker with highest token succeeds
5. Workers with stale tokens rejected

**Expected output:**
```
[Worker 1] ✗ Rejected with token 1 (stale)
[Worker 2] ✗ Rejected with token 2 (stale)
[Worker 3] ✓ Success with token 3
```

### Manual Testing

```bash
# Test race condition (no lock)
for i in {1..10}; do
  curl -X POST http://localhost:3002/demo/race-condition/no-lock &
done
wait

# Check balance (will be wrong)
curl http://localhost:3002/demo/balance

# Reset
curl -X POST http://localhost:3002/demo/balance/reset

# Test with lock
for i in {1..10}; do
  curl -X POST http://localhost:3002/demo/race-condition/with-lock &
done
wait

# Check balance (will be correct)
curl http://localhost:3002/demo/balance
```

---

## 📈 Architecture Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    Client Requests                       │
└───────────────────────┬─────────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
   ┌────▼────┐     ┌────▼────┐    ┌────▼────┐
   │Instance │     │Instance │    │Instance │
   │    1    │     │    2    │    │    3    │
   └────┬────┘     └────┬────┘    └────┬────┘
        │               │               │
        └───────────────┼───────────────┘
                        │
                   ┌────▼────┐
                   │  Redis  │  ← Distributed Lock
                   │ Server  │
                   └─────────┘

Without Lock:
  Instance 1: balance = 1000 ─┐
  Instance 2: balance = 1000 ─┤ ← All read same value
  Instance 3: balance = 1000 ─┘
                               ↓
                        Race condition! ❌

With Lock:
  Instance 1: Acquire lock → process → release
  Instance 2: Wait for lock → process → release
  Instance 3: Wait for lock → process → release
                               ↓
                        Sequential execution ✅
```

---

## 🎓 Key Takeaways

### Race Conditions

1. **Problem**: Multiple processes read-modify-write same data
2. **Symptom**: Lost updates, inconsistent state
3. **Solution**: Distributed locks + fenced tokens

### Distributed Locks

1. **Redis lock**: SET NX PX (atomic check-and-set)
2. **Lua script**: Atomic check-and-delete for release
3. **TTL**: Auto-expire to prevent deadlock
4. **Owner token**: Prevent releasing wrong lock

### Redlock

1. **Multiple Redis**: 3 or 5 independent servers
2. **Majority vote**: Need N/2 + 1 successes
3. **Time-bound**: Account for clock drift
4. **Trade-off**: Complexity vs availability

### Fenced Tokens

1. **Problem**: Lock expires, worker still processes
2. **Solution**: Monotonic token + validation
3. **Implementation**: Redis INCR + check before write
4. **Critical**: Essential for financial systems

### Reliability Patterns

1. **Timeout**: Fail fast, don't wait forever
2. **Retry**: Exponential backoff + jitter
3. **Bulkhead**: Limit concurrency
4. **Circuit Breaker**: Fail fast when service down

---

## 🚀 Production Considerations

### Lock TTL Selection

```
TTL = 2 × (Processing Time) + Network Latency
```

**Example:**
- Processing: 500ms
- Network: 50ms
- TTL: 2 × 500 + 50 = 1050ms → Use 1500ms

**Why 2×?**
- Safety margin for GC pauses
- Network delays
- Clock drift

### Lock Extension

For long operations:

```typescript
const token = await lockService.acquire('lock:key', 5000);

// Start background task to extend lock
const extendInterval = setInterval(async () => {
  await lockService.extend('lock:key', token, 5000);
}, 2500); // Extend every 2.5s

try {
  await longRunningOperation();
} finally {
  clearInterval(extendInterval);
  await lockService.release('lock:key', token);
}
```

### Monitoring

Track these metrics:

```typescript
// Lock acquisition failures
lockAcquisitionFailures.inc();

// Lock hold time
lockHoldTime.observe(duration);

// Lock contentions
lockContentions.inc();

// Fenced token rejections
fencedTokenRejections.inc();
```

### Alerts

```yaml
- alert: HighLockContention
  expr: rate(lock_contentions[5m]) > 10
  annotations:
    summary: "High lock contention detected"

- alert: LockAcquisitionFailures
  expr: rate(lock_failures[5m]) > 5
  annotations:
    summary: "Lock acquisitions failing"

- alert: FencedTokenRejections
  expr: rate(fenced_token_rejections[5m]) > 1
  annotations:
    summary: "Stale writes detected"
```

---

## 📚 Summary

**Phase 6 Complete!** ✅

You now understand:
- ✅ Race conditions in distributed systems
- ✅ Redis distributed locks (SET NX PX)
- ✅ Redlock algorithm for HA
- ✅ Fenced tokens to prevent stale writes
- ✅ Reliability patterns (retry, timeout, bulkhead)
- ✅ When to use which locking strategy

**Next Steps:**
- Monitor lock metrics in production
- Implement lease extension for long operations
- Consider Etcd/Zookeeper for critical systems
- Always use fenced tokens for financial operations

---

**This is the final "hard" phase!** 🎉

Your microservices system now has:
1. API Gateway (routing, aggregation)
2. Horizontal scaling (multiple instances)
3. Load balancing (nginx, Kubernetes)
4. Event-driven (Kafka, pub/sub)
5. Saga pattern (distributed transactions)
6. **Distributed locking (race condition protection)** ← You are here!

**Ready for production!** 🚀

# Distributed Locking

## Overview

Distributed locking ensures that only one process can access a shared resource at a time across multiple instances of an application. This is critical for preventing race conditions, data corruption, and ensuring consistency in distributed systems.

## The Problem

### Race Condition Example

```typescript
// Two API instances processing the same order
let balance = 1000;

@Post('/payment')
async processPayment(amount: number) {
  // Read balance
  const current = balance;  // Instance 1: 1000, Instance 2: 1000
  
  // Check funds
  if (current >= amount) {
    // Deduct
    balance = current - amount;  // Both write 900!
    return 'Success';
  }
}
```

**Timeline:**
```
Time    Instance 1          Instance 2          Balance
─────────────────────────────────────────────────────
T1      Read: 1000                             1000
T2                          Read: 1000         1000
T3      Check: OK                              1000
T4                          Check: OK          1000
T5      Write: 900                             900
T6                          Write: 900         900   Should be 800!
```

**Result:** Lost $100 due to race condition!

## Single-Instance Locking

### In-Memory Lock (Not Distributed)

```typescript
//  DOESN'T WORK across instances
let isLocked = false;

async processWithLock() {
  if (isLocked) {
    throw new Error('Resource busy');
  }
  
  isLocked = true;
  try {
    // Critical section
    await this.doWork();
  } finally {
    isLocked = false;
  }
}

// Problem: Each instance has its own `isLocked` variable!
```

### Advisory Locks (PostgreSQL)

Database-level locks that work across connections.

```typescript
@Injectable()
export class AdvisoryLockService {
  constructor(
    @InjectDataSource() private dataSource: DataSource
  ) {}

  async withLock<T>(
    lockId: number,
    fn: () => Promise<T>
  ): Promise<T> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Acquire advisory lock
      await queryRunner.query('SELECT pg_advisory_lock($1)', [lockId]);
      
      // Execute critical section
      const result = await fn();
      
      return result;
    } finally {
      // Release lock
      await queryRunner.query('SELECT pg_advisory_unlock($1)', [lockId]);
      await queryRunner.release();
    }
  }

  // Try to acquire without blocking
  async tryLock(lockId: number): Promise<boolean> {
    const result = await this.dataSource.query(
      'SELECT pg_try_advisory_lock($1)',
      [lockId]
    );
    return result[0].pg_try_advisory_lock;
  }
}
```

**Usage:**
```typescript
@Post('payment')
async processPayment(orderId: string) {
  // Convert orderId to number for lock ID
  const lockId = this.hashToNumber(orderId);

  return this.advisoryLock.withLock(lockId, async () => {
    // Only one instance can execute this at a time
    const order = await this.orderRepository.findOne(orderId);
    
    if (order.status !== 'pending') {
      throw new Error('Order already processed');
    }

    order.status = 'processing';
    await this.orderRepository.save(order);
    await this.processPayment(order);
  });
}
```

**Pros:**
-  Works across multiple app instances
-  Automatic cleanup on connection loss
-  Built into PostgreSQL

**Cons:**
-  Only works with PostgreSQL
-  Requires database connection

### Database Row-Level Locks

```typescript
// Pessimistic locking
async processOrder(orderId: string) {
  const queryRunner = this.dataSource.createQueryRunner();
  await queryRunner.connect();
  await queryRunner.startTransaction();

  try {
    // SELECT FOR UPDATE - locks the row
    const order = await queryRunner.manager
      .createQueryBuilder(Order, 'order')
      .setLock('pessimistic_write')
      .where('order.id = :id', { id: orderId })
      .getOne();

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    // Process order (row is locked)
    order.status = 'processed';
    await queryRunner.manager.save(order);

    await queryRunner.commitTransaction();
  } catch (error) {
    await queryRunner.rollbackTransaction();
    throw error;
  } finally {
    await queryRunner.release();
  }
}
```

## Distributed Locks (Redis)

### Simple Redis Lock

```typescript
import { Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';

@Injectable()
export class RedisLockService {
  constructor(private redis: Redis) {}

  async acquireLock(
    resource: string,
    ttl: number = 10000 // 10 seconds
  ): Promise<string | null> {
    const lockKey = `lock:${resource}`;
    const lockValue = this.generateLockId();

    // SET NX (set if not exists) with expiry
    const result = await this.redis.set(
      lockKey,
      lockValue,
      'PX', // milliseconds
      ttl,
      'NX'  // only set if not exists
    );

    return result === 'OK' ? lockValue : null;
  }

  async releaseLock(resource: string, lockValue: string): Promise<boolean> {
    const lockKey = `lock:${resource}`;

    // Lua script to check and delete atomically
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(script, 1, lockKey, lockValue);
    return result === 1;
  }

  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    ttl: number = 10000
  ): Promise<T> {
    const lockValue = await this.acquireLock(resource, ttl);

    if (!lockValue) {
      throw new Error('Failed to acquire lock');
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(resource, lockValue);
    }
  }

  private generateLockId(): string {
    return `${Date.now()}-${Math.random()}`;
  }
}
```

**Usage:**
```typescript
@Post('payment/:orderId')
async processPayment(@Param('orderId') orderId: string) {
  return this.redisLock.withLock(`order:${orderId}`, async () => {
    const order = await this.orderRepository.findOne(orderId);
    
    if (order.status !== 'pending') {
      throw new Error('Order already processed');
    }

    // Process payment
    await this.paymentService.charge(order);
    
    order.status = 'paid';
    await this.orderRepository.save(order);
  }, 30000); // 30 second lock
}
```

### Redlock Algorithm (Multi-Instance)

For high availability, lock across multiple Redis instances.

```typescript
import Redlock from 'redlock';
import Redis from 'ioredis';

@Injectable()
export class RedlockService {
  private redlock: Redlock;

  constructor() {
    // Connect to multiple Redis instances
    const redis1 = new Redis({ host: 'redis1', port: 6379 });
    const redis2 = new Redis({ host: 'redis2', port: 6379 });
    const redis3 = new Redis({ host: 'redis3', port: 6379 });

    this.redlock = new Redlock(
      [redis1, redis2, redis3],
      {
        // The expected clock drift (in ms)
        driftFactor: 0.01,
        
        // The max number of times to retry
        retryCount: 10,
        
        // Time between retries (ms)
        retryDelay: 200,
        
        // Max retry delay (ms)
        retryJitter: 200
      }
    );
  }

  async acquireLock(
    resource: string,
    ttl: number = 10000
  ): Promise<Redlock.Lock> {
    try {
      return await this.redlock.acquire([`lock:${resource}`], ttl);
    } catch (error) {
      throw new Error(`Failed to acquire lock: ${error.message}`);
    }
  }

  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    ttl: number = 10000
  ): Promise<T> {
    const lock = await this.acquireLock(resource, ttl);

    try {
      return await fn();
    } finally {
      try {
        await lock.release();
      } catch (error) {
        console.error('Failed to release lock:', error);
      }
    }
  }
}
```

**How Redlock Works:**

1. Get current timestamp
2. Try to acquire lock on all N instances sequentially
3. Calculate total time taken
4. If acquired lock on majority (N/2 + 1) and within validity time → success
5. Otherwise, release all locks and retry

```
Redis 1: LOCK 
Redis 2: LOCK 
Redis 3: LOCK 
Result: 2/3 = majority → Lock acquired!
```

### Lock Extension (Heartbeat)

For long-running operations, extend the lock periodically.

```typescript
@Injectable()
export class ExtendableLockService {
  async withExtendableLock<T>(
    resource: string,
    fn: () => Promise<T>,
    initialTtl: number = 10000,
    extendInterval: number = 5000
  ): Promise<T> {
    const lockValue = await this.acquireLock(resource, initialTtl);
    
    if (!lockValue) {
      throw new Error('Failed to acquire lock');
    }

    // Start heartbeat to extend lock
    const heartbeat = setInterval(async () => {
      const extended = await this.extendLock(resource, lockValue, initialTtl);
      if (!extended) {
        clearInterval(heartbeat);
        console.error('Failed to extend lock');
      }
    }, extendInterval);

    try {
      return await fn();
    } finally {
      clearInterval(heartbeat);
      await this.releaseLock(resource, lockValue);
    }
  }

  private async extendLock(
    resource: string,
    lockValue: string,
    ttl: number
  ): Promise<boolean> {
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("pexpire", KEYS[1], ARGV[2])
      else
        return 0
      end
    `;

    const result = await this.redis.eval(
      script,
      1,
      `lock:${resource}`,
      lockValue,
      ttl
    );

    return result === 1;
  }
}
```

## Consensus-Based Locks

### ZooKeeper Locks

For when you need strong consistency guarantees.

```typescript
import { ZooKeeper } from 'node-zookeeper-client';

@Injectable()
export class ZooKeeperLockService {
  private zk: ZooKeeper;

  constructor() {
    this.zk = new ZooKeeper('zookeeper:2181');
    this.zk.connect();
  }

  async acquireLock(resource: string): Promise<void> {
    const lockPath = `/locks/${resource}`;

    // Create ephemeral sequential node
    const path = await this.zk.create(
      `${lockPath}/lock-`,
      Buffer.from(''),
      ZooKeeper.CreateMode.EPHEMERAL_SEQUENTIAL
    );

    // Get all lock nodes
    const children = await this.zk.getChildren(lockPath);
    children.sort();

    // Check if we have the lowest sequence number
    const ourNode = path.split('/').pop();
    const ourIndex = children.indexOf(ourNode);

    if (ourIndex === 0) {
      // We have the lock!
      return;
    }

    // Wait for the node before us to be deleted
    const previousNode = children[ourIndex - 1];
    await this.waitForNodeDeletion(`${lockPath}/${previousNode}`);

    // Recursively check again
    return this.acquireLock(resource);
  }

  private async waitForNodeDeletion(path: string): Promise<void> {
    return new Promise((resolve) => {
      this.zk.exists(path, (event) => {
        if (event.type === ZooKeeper.Event.NODE_DELETED) {
          resolve();
        }
      });
    });
  }
}
```

### Etcd Locks

```typescript
import { Etcd3 } from 'etcd3';

@Injectable()
export class EtcdLockService {
  private client: Etcd3;

  constructor() {
    this.client = new Etcd3({
      hosts: 'etcd:2379'
    });
  }

  async withLock<T>(
    resource: string,
    fn: () => Promise<T>,
    ttl: number = 10
  ): Promise<T> {
    const lock = this.client.lock(`lock-${resource}`);
    
    try {
      await lock.acquire();
      return await fn();
    } finally {
      await lock.release();
    }
  }
}
```

## Fenced Tokens

Prevent stale lock holders from writing.

```typescript
@Injectable()
export class FencedTokenService {
  private tokenCounter = 0;

  async acquireLockWithToken(
    resource: string
  ): Promise<{ lockValue: string; token: number } | null> {
    const lockValue = await this.acquireLock(resource);
    
    if (!lockValue) {
      return null;
    }

    // Increment token counter
    const token = ++this.tokenCounter;
    
    // Store token with lock
    await this.redis.set(
      `lock:${resource}:token`,
      token.toString()
    );

    return { lockValue, token };
  }

  async writeWithToken<T>(
    resource: string,
    token: number,
    fn: () => Promise<T>
  ): Promise<T> {
    // Check if token is still valid
    const currentToken = await this.redis.get(`lock:${resource}:token`);
    
    if (parseInt(currentToken) !== token) {
      throw new Error('Stale token - lock expired');
    }

    return fn();
  }
}
```

**How it works:**
```
Instance 1: Acquire lock (token=1) → Process slowly
Instance 2: Acquire lock (token=2) → Process quickly → Write 

Instance 1: Try to write with token=1
            Check: current token=2, received token=1
            → Reject write  (stale!)
```

## Best Practices

### 1. Always Set TTL

```typescript
//  GOOD: Lock expires automatically
await redis.set('lock:order', 'value', 'PX', 10000, 'NX');

//  BAD: Lock never expires if process crashes
await redis.set('lock:order', 'value', 'NX');
```

### 2. Use Unique Lock Values

```typescript
//  GOOD: Can verify ownership before releasing
const lockValue = `${process.pid}-${Date.now()}-${Math.random()}`;

//  BAD: Anyone can release the lock
const lockValue = 'true';
```

### 3. Atomic Check-and-Delete

```typescript
//  GOOD: Atomic Lua script
const script = `
  if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
  end
`;
await redis.eval(script, 1, lockKey, lockValue);

//  BAD: Race condition between get and del
const current = await redis.get(lockKey);
if (current === lockValue) {
  await redis.del(lockKey); // Another process might have modified it!
}
```

### 4. Handle Lock Acquisition Failure

```typescript
//  GOOD: Retry with exponential backoff
async function acquireWithRetry(
  resource: string,
  maxRetries: number = 5
): Promise<string> {
  for (let i = 0; i < maxRetries; i++) {
    const lockValue = await this.acquireLock(resource);
    if (lockValue) {
      return lockValue;
    }
    
    // Exponential backoff
    await sleep(Math.pow(2, i) * 100);
  }
  
  throw new Error('Failed to acquire lock after retries');
}

//  BAD: Fail immediately
const lockValue = await this.acquireLock(resource);
if (!lockValue) {
  throw new Error('Lock busy');
}
```

### 5. Monitor Lock Contention

```typescript
@Injectable()
export class LockMetrics {
  recordLockAcquisition(
    resource: string,
    success: boolean,
    duration: number
  ) {
    this.prometheus.increment('lock_acquisition_total', {
      resource,
      success: success.toString()
    });

    this.prometheus.observe('lock_wait_duration_ms', duration, {
      resource
    });

    if (!success) {
      console.warn(`Lock contention on ${resource}`);
    }
  }
}
```

## When to Use Which Lock?

| Scenario | Solution |
|----------|----------|
| Single database, strong consistency | PostgreSQL advisory locks |
| Distributed, moderate load | Redis simple lock |
| High availability required | Redlock (multiple Redis) |
| Strong consistency required | ZooKeeper/Etcd |
| Prevent stale writes | Fenced tokens |
| Short-lived operations | Simple locks |
| Long-running operations | Lock with heartbeat |

## Testing

```typescript
describe('Distributed Lock', () => {
  it('should prevent concurrent access', async () => {
    let counter = 0;

    // Simulate 100 concurrent requests
    const promises = Array.from({ length: 100 }, () =>
      lockService.withLock('counter', async () => {
        const current = counter;
        await sleep(10); // Simulate work
        counter = current + 1;
      })
    );

    await Promise.all(promises);

    expect(counter).toBe(100); // No race condition!
  });

  it('should timeout if lock held too long', async () => {
    await lockService.acquireLock('resource', 1000);

    await expect(
      lockService.acquireLock('resource', 500)
    ).rejects.toThrow('Lock acquisition timeout');
  });
});
```

## Project Implementation

See:
- [Distributed locking implementation](../../../backend/PHASE6-DISTRIBUTED-LOCKING.md)
- [Lock service](../../../backend/libs/distributed-lock/)
- [Test scripts](../../../backend/test-race-condition.sh)
- [Fenced tokens test](../../../backend/test-fenced-tokens.sh)

## Next Steps

- Learn about [Saga Pattern](../saga-pattern/index.md)
- Explore [Observability](../observability/index.md)
- Check [Reliability Patterns](../reliability-patterns/index.md)

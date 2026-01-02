# Fenced Tokens

## The Problem: Lock Expiration

Even with distributed locks, there's a subtle bug that can cause data corruption.

### Scenario

```
Time | Worker A                  | Worker B        | Lock
-----|---------------------------|-----------------|--------
T1   | Acquire lock             |                 | A owns
T2   | Start processing...      |                 | A owns
T3   | GC pause (STW)           |                 | A owns
T4   |                          |                 | Expired!
T5   |                          | Acquire lock    | B owns
T6   |                          | Process + write | B owns
T7   | Resume from GC pause     |                 | B owns
T8   | Write data ← STALE!    |                 | B owns
```

**Worker A writes stale data** even though it no longer holds the lock!

## Why Locks Aren't Enough

Distributed locks solve **mutual exclusion** but not **timing bugs**:

1.  Only one process holds lock at a time
2.  Process can continue after lock expires
3.  Delayed process writes stale data

## Solution: Fenced Tokens

Martin Kleppmann (author of "Designing Data-Intensive Applications") proposed **fenced tokens** to solve this.

### How It Works

1. **Token increments** with each lock acquisition
2. **Storage validates** token before accepting write
3. **Stale tokens rejected** automatically

### Implementation

```typescript
// Token generation (monotonically increasing)
const token = await redis.incr('fence:resource:123');
// Returns: 1, 2, 3, 4, 5, ...
```

### Complete Flow

```
Time | Worker A        | Worker B        | Token | Storage
-----|-----------------|-----------------|-------|----------
T1   | Get token=1     |                 | 1     |
T2   | Acquire lock    |                 | 1     |
T3   | Process...      |                 | 1     |
T4   | GC pause        |                 | 1     |
T5   | (paused)        | Get token=2     | 2     |
T6   | (paused)        | Acquire lock    | 2     |
T7   | (paused)        | Write(token=2)  | 2     |  Accept
T8   | Resume          |                 | 2     |
T9   | Write(token=1)  |                 | 2     |  Reject
```

**Storage rejects token=1** because current token is 2!

## Code Example

### Acquiring Lock with Token

```typescript
async function processOrder(orderId: string) {
  const resource = `order:${orderId}`;
  
  // 1. Get fenced token (increments automatically)
  const fencedToken = await redis.incr(`fence:${resource}`);
  console.log(`Got token: ${fencedToken}`);
  
  // 2. Acquire distributed lock
  const lockToken = await redis.set(
    `lock:${resource}`,
    'worker-1',
    'NX',
    'PX',
    5000
  );
  
  if (!lockToken) {
    throw new Error('Failed to acquire lock');
  }
  
  try {
    // 3. Do processing (might take long time)
    await processOrder(orderId);
    
    // 4. Before writing, validate token
    const currentToken = await redis.get(`fence:${resource}`);
    
    if (parseInt(currentToken) !== fencedToken) {
      throw new Error('Stale operation - token outdated');
    }
    
    // 5. Safe to write
    await database.save(order);
    
  } finally {
    await redis.del(`lock:${resource}`);
  }
}
```

### Storage-Side Validation

```typescript
async function saveToDatabase(data, token) {
  const currentToken = await redis.get(`fence:${data.resource}`);
  
  // Reject if token is stale
  if (token < parseInt(currentToken)) {
    throw new Error(
      `Stale write rejected: token ${token} < current ${currentToken}`
    );
  }
  
  // Token is valid, proceed with write
  await db.save(data);
}
```

## Why This Works

### Token Properties

1. **Monotonically Increasing**: Never decreases
   ```
   Token: 1 → 2 → 3 → 4 → 5 ...
   ```

2. **Atomic Generation**: Redis INCR is atomic
   ```typescript
   await redis.incr('fence:key'); // Thread-safe
   ```

3. **Independent of Lock**: Token exists even after lock expires
   ```
   Lock expires → New process gets lock + new token
   Old process → Tries to write with old token → Rejected
   ```

## Use Cases

### When You MUST Use Fenced Tokens

 **Financial transactions**
- Money transfers
- Payment processing
- Account balance updates

 **Inventory management**
- Stock quantity updates
- Reservation systems
- Ticket booking

 **Critical state updates**
- User permissions
- Configuration changes
- Database migrations

### When Fenced Tokens Are Optional

 **Best-effort operations**
- Metrics collection
- Cache updates
- Log aggregation

 **Idempotent operations**
- Sending emails (with deduplication)
- Publishing events (with message IDs)

## Comparison

| Approach | Mutual Exclusion | Prevents Stale Writes | Complexity |
|----------|------------------|----------------------|------------|
| **No Lock** |  |  | Low |
| **Distributed Lock** |  |  | Medium |
| **Lock + Fenced Token** |  |  | High |

## Implementation Tips

### 1. Generate Token Before Lock

```typescript
//  Correct order
const token = await getToken();
const lock = await acquireLock();

//  Wrong order - lock might expire before token generated
const lock = await acquireLock();
const token = await getToken();
```

### 2. Store Token with Data

```typescript
await database.save({
  ...data,
  fencedToken: token,  // Store token with data
  timestamp: Date.now()
});
```

### 3. Validate on Every Write

```typescript
// Always validate before critical writes
await validateToken(resource, token);
await database.save(data);
```

## Real-World Example: Bank Transfer

```typescript
async function transferMoney(from: string, to: string, amount: number) {
  const resource = `account:${from}`;
  
  // Get fenced token
  const token = await redis.incr(`fence:${resource}`);
  
  // Acquire lock
  const lock = await acquireLock(resource, 5000);
  
  try {
    // Read balance
    const balance = await getBalance(from);
    
    // Check sufficient funds
    if (balance < amount) {
      throw new Error('Insufficient funds');
    }
    
    // Simulate slow processing (network delay, GC pause, etc.)
    await sleep(3000);
    
    // Validate token before writing
    if (!await validateToken(resource, token)) {
      throw new Error('Transfer aborted - stale operation');
    }
    
    // Execute transfer
    await debit(from, amount, token);
    await credit(to, amount, token);
    
  } finally {
    await releaseLock(resource, lock);
  }
}
```

## Key Takeaways

1. **Distributed locks** solve mutual exclusion
2. **Fenced tokens** solve timing bugs
3. **Always use both** for critical operations
4. **Token increments** automatically (Redis INCR)
5. **Storage validates** token before write
6. **Essential** for financial systems

Next: Explore Redlock algorithm for multi-node Redis setups

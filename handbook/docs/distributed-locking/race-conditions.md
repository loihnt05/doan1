# Race Conditions in Distributed Systems

## What is a Race Condition?

A **race condition** occurs when multiple processes access and modify shared data concurrently, and the final result depends on the timing of execution.

## Example: The Lost Update Problem

### Scenario: Payment Processing

```typescript
let balance = 1000; // Shared account balance

async function processPayment(amount: number) {
  // Step 1: Read current balance
  const current = balance;
  
  // Step 2: Check sufficient funds
  if (current >= amount) {
    // Step 3: Deduct amount
    balance = current - amount;
    return 'Payment successful';
  }
  
  return 'Insufficient funds';
}
```

### What Happens with Concurrent Requests?

```
Time | Request A        | Request B        | Balance
-----|------------------|------------------|--------
T1   | Read: 1000      |                  | 1000
T2   |                 | Read: 1000       | 1000
T3   | Check: OK       |                  | 1000
T4   |                 | Check: OK        | 1000
T5   | Write: 900      |                  | 900
T6   |                 | Write: 900       | 900
```

**Expected:** $800  
**Actual:** $900  
**Lost:** $100 ❌

## Why Does This Happen?

This is called a **check-then-act** race condition:

1. Both requests **read** the same value (1000)
2. Both **check** sufficient funds (OK)
3. Both **write** the same result (900)
4. Second write **overwrites** the first

## Types of Race Conditions

### 1. Read-Modify-Write

```typescript
// Both read counter = 10
counter++;
// Both write counter = 11 (should be 12!)
```

### 2. Check-Then-Act

```typescript
if (!exists(file)) {  // Both check: false
  create(file);       // Both create: error!
}
```

### 3. Time-of-Check to Time-of-Use (TOCTOU)

```typescript
if (hasPermission(user)) {  // Check at T1
  // Permission revoked at T2
  performAction();           // Use at T3 - Wrong!
}
```

## Why Local Locks Don't Work in Distributed Systems

### Single Process Lock (BAD for Microservices)

```typescript
let locked = false;

async function processPayment() {
  if (locked) {
    return 'Busy';
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

### Why This Fails

```
Instance 1:
  locked = false  ← Local variable
  acquires lock
  processes payment

Instance 2:
  locked = false  ← Different memory!
  also acquires lock
  also processes payment ❌
```

**Problem:** Each instance has its own `locked` variable!

## Real-World Examples

### 1. E-commerce Inventory

```
2 customers buy last item simultaneously
→ Both see "1 in stock"
→ Both complete purchase
→ Oversold! ❌
```

### 2. Bank Transfer

```
Account has $100
Transfer A: -$100
Transfer B: -$50
→ Both see $100
→ Final balance: -$50 ❌
```

### 3. Ticket Booking

```
Last seat available
User A: Reserve seat 1A
User B: Reserve seat 1A
→ Both get confirmation
→ Double booking! ❌
```

## Solution Preview

The solution is **distributed locking**:

```typescript
// Acquire distributed lock
const lock = await redis.set('lock:balance', 'worker-1', 'NX', 'PX', 5000);

if (!lock) {
  return 'Resource busy';
}

try {
  // Critical section - only ONE instance executes
  balance -= 100;
} finally {
  // Release lock
  await redis.del('lock:balance');
}
```

We'll explore this in detail in the next section: [Distributed Locks](./distributed-locks.md)

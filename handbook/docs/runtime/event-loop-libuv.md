---
sidebar_position: 2
---
# Event Loop & libuv (Lõi của Node.js)

## Event Loop Phases

Node.js event loop executes in the following phases:

```
   ┌───────────────────────────┐
┌─>│           timers          │  // setTimeout, setInterval callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │     pending callbacks     │  // I/O callbacks deferred to next loop iteration
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │       idle, prepare       │  // Internal use only
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           poll            │  // Retrieve new I/O events; execute I/O callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │           check           │  // setImmediate() callbacks
│  └─────────────┬─────────────┘
│  ┌─────────────┴─────────────┐
│  │      close callbacks      │  // e.g. socket.on('close', ...)
│  └───────────────────────────┘
└────────────────────────────────
```

**Key Phases:**

1. **Timers**: Executes callbacks scheduled by `setTimeout()` and `setInterval()`
2. **Pending callbacks**: Executes I/O callbacks deferred from previous cycle
3. **Idle, prepare**: Internal use only
4. **Poll**: Retrieves new I/O events and executes I/O-related callbacks
5. **Check**: Executes `setImmediate()` callbacks
6. **Close callbacks**: Executes close event callbacks (e.g., `socket.on('close')`)

## Microtask vs Macrotask

**Microtasks** (executed immediately after current operation):
- `Promise.then()`, `Promise.catch()`, `Promise.finally()`
- `process.nextTick()` (highest priority)
- `queueMicrotask()`

**Macrotasks** (executed in next event loop iteration):
- `setTimeout()`, `setInterval()`
- `setImmediate()`
- I/O operations
- UI rendering (in browsers)

```javascript
console.log('1: Start');

setTimeout(() => console.log('2: setTimeout'), 0);
setImmediate(() => console.log('3: setImmediate'));

Promise.resolve().then(() => console.log('4: Promise'));
process.nextTick(() => console.log('5: nextTick'));

console.log('6: End');

// Output order:
// 1: Start
// 6: End
// 5: nextTick (highest priority microtask)
// 4: Promise (microtask)
// 2: setTimeout (macrotask - timers phase)
// 3: setImmediate (macrotask - check phase)
```

## libuv Thread Pool

libuv provides a thread pool for handling blocking operations:

**Default pool size**: 4 threads

**Operations using thread pool**:
- File system operations (fs.*)
- DNS lookups (`dns.lookup()`)
- Crypto operations
- Zlib compression

**Configure thread pool size**:
```bash
# Set environment variable before starting Node.js
export UV_THREADPOOL_SIZE=8
node app.js

# Or inline
UV_THREADPOOL_SIZE=8 node app.js
```

**Best practices**:
- Increase pool size for CPU-intensive operations
- Monitor thread pool saturation
- Consider Worker Threads for heavy computation

## Blocking vs Non-blocking

**Blocking operations** (avoid in main thread):
```javascript
// ❌ Blocking - freezes event loop
const data = fs.readFileSync('/file.txt');
crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
```

**Non-blocking alternatives**:
```javascript
// ✅ Non-blocking - event loop continues
fs.readFile('/file.txt', (err, data) => {
  // Handle data
});

// ✅ Promise-based
const data = await fs.promises.readFile('/file.txt');

crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, key) => {
  // Handle key
});
```

## Async Hooks

Monitor asynchronous resource lifecycle:

```javascript
const async_hooks = require('async_hooks');
const fs = require('fs');

// Track async operations
const asyncHook = async_hooks.createHook({
  init(asyncId, type, triggerAsyncId, resource) {
    fs.writeSync(1, `Init: ${type}(${asyncId}), Trigger: ${triggerAsyncId}\n`);
  },
  before(asyncId) {
    fs.writeSync(1, `Before: ${asyncId}\n`);
  },
  after(asyncId) {
    fs.writeSync(1, `After: ${asyncId}\n`);
  },
  destroy(asyncId) {
    fs.writeSync(1, `Destroy: ${asyncId}\n`);
  }
});

asyncHook.enable();

// Use for:
// - Request context tracking
// - Performance monitoring
// - Debugging async flows
```

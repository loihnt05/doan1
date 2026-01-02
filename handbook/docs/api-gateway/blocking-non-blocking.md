---
sidebar_position: 4
---
# Blocking vs Non-Blocking I/O

## Overview

Understanding blocking vs non-blocking I/O is crucial for building high-performance API Gateways. Node.js's event-driven, non-blocking architecture makes it excellent for I/O-heavy operations, but CPU-intensive tasks can block the event loop and kill performance.

## The Event Loop

Node.js operates on a single-threaded event loop:

```
┌───────────────────────────┐
┌─>│        Timers            │
│  └─────────────┬────────────┘
│  ┌─────────────▼────────────┐
│  │    Pending Callbacks     │
│  └─────────────┬────────────┘
│  ┌─────────────▼────────────┐
│  │       Idle, Prepare      │
│  └─────────────┬────────────┘
│  ┌─────────────▼────────────┐
│  │         Poll             │<── I/O operations
│  └─────────────┬────────────┘
│  ┌─────────────▼────────────┐
│  │         Check            │
│  └─────────────┬────────────┘
│  ┌─────────────▼────────────┐
│  │    Close Callbacks       │
│  └─────────────┬────────────┘
└──────────────────────────────┘
```

## Blocking Operations

### What Blocks the Event Loop?

1. **CPU-Intensive Computations**
   ```typescript
   //  BAD: Blocks event loop
   @Get('fibonacci')
   calculateFibonacci(@Query('n') n: number) {
     function fib(num: number): number {
       if (num <= 1) return num;
       return fib(num - 1) + fib(num - 2);
     }
     return fib(n); // Blocks for large n
   }
   ```

2. **Synchronous File Operations**
   ```typescript
   //  BAD: Blocks event loop
   const data = fs.readFileSync('/large-file.txt');
   ```

3. **Synchronous Crypto Operations**
   ```typescript
   //  BAD: Blocks event loop
   const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512');
   ```

4. **Complex JSON Parsing**
   ```typescript
   //  BAD: Can block for very large payloads
   const data = JSON.parse(hugeJsonString);
   ```

### Real-World Example from Our Project

Our project demonstrates the blocking problem:

```typescript
// This endpoint simulates CPU-intensive work
@Get('cpu-intensive')
async cpuIntensive() {
  const start = Date.now();
  
  // Simulate heavy computation
  let result = 0;
  for (let i = 0; i < 10_000_000_000; i++) {
    result += Math.sqrt(i);
  }
  
  return {
    result,
    duration: Date.now() - start,
    message: 'CPU-intensive task completed'
  };
}
```

**Test Results:**
- **Single Instance**: 53,364ms (blocks all other requests!)
- **3 Instances**: 116ms per instance (requests distributed)

## Non-Blocking Operations

### I/O Operations (Naturally Non-Blocking)

```typescript
//  GOOD: Non-blocking
@Get('users')
async getUsers() {
  // Database query doesn't block
  return await this.userRepository.find();
}

@Get('external-api')
async fetchData() {
  // HTTP request doesn't block
  return await this.httpService.get('https://api.example.com/data');
}
```

### How Non-Blocking Works

```
Request 1 arrives → Event Loop → Initiate DB query → Continue
Request 2 arrives → Event Loop → Initiate API call → Continue
Request 3 arrives → Event Loop → Initiate File read → Continue
                         ↓
                  DB query completes → Callback → Response 1
                  API call completes → Callback → Response 2
                  File read completes → Callback → Response 3
```

All three requests are handled concurrently on a single thread!

## Solutions for CPU-Intensive Work

### 1. Worker Threads

Use worker threads for CPU-intensive tasks:

```typescript
import { Worker } from 'worker_threads';

@Injectable()
export class CpuService {
  async heavyComputation(data: any) {
    return new Promise((resolve, reject) => {
      const worker = new Worker('./cpu-worker.js', {
        workerData: data
      });
      
      worker.on('message', resolve);
      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker stopped with exit code ${code}`));
        }
      });
    });
  }
}
```

**Worker file (cpu-worker.js):**
```javascript
const { parentPort, workerData } = require('worker_threads');

// Perform heavy computation
const result = computeHeavyTask(workerData);

// Send result back
parentPort.postMessage(result);
```

### 2. Cluster Module

Fork multiple processes to utilize all CPU cores:

```typescript
import cluster from 'cluster';
import os from 'os';

if (cluster.isPrimary) {
  const numCPUs = os.cpus().length;
  
  console.log(`Master process ${process.pid} is running`);
  console.log(`Forking ${numCPUs} workers...`);
  
  // Fork workers
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died. Forking new worker...`);
    cluster.fork();
  });
} else {
  // Workers share the TCP connection
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  
  console.log(`Worker ${process.pid} started`);
}
```

### 3. Message Queue

Offload heavy tasks to a background worker via message queue:

```typescript
// API Gateway - Producer
@Post('process-data')
async processData(@Body() data: any) {
  // Send to queue immediately (non-blocking)
  await this.kafkaService.send('heavy-tasks', {
    taskId: uuid(),
    data: data,
    timestamp: Date.now()
  });
  
  return {
    message: 'Task queued for processing',
    taskId: taskId
  };
}

// Background Worker - Consumer
@Injectable()
export class HeavyTaskConsumer {
  @EventPattern('heavy-tasks')
  async handleTask(data: any) {
    // CPU-intensive work happens here
    // Doesn't block the API Gateway
    const result = await this.performHeavyComputation(data);
    
    // Store result or notify client
    await this.storeResult(data.taskId, result);
  }
}
```

### 4. Async/Await Properly

Always use async/await for I/O operations:

```typescript
//  GOOD: Non-blocking
@Get('data')
async getData() {
  const [users, orders] = await Promise.all([
    this.userService.getUsers(),      // Runs concurrently
    this.orderService.getOrders()     // Runs concurrently
  ]);
  
  return { users, orders };
}

//  BAD: Sequential (slower but still non-blocking)
@Get('data')
async getData() {
  const users = await this.userService.getUsers();   // Wait
  const orders = await this.orderService.getOrders(); // Then wait again
  
  return { users, orders };
}
```

## Monitoring Event Loop Lag

Detect when event loop is blocked:

```typescript
import { performance } from 'perf_hooks';

@Injectable()
export class EventLoopMonitor {
  private readonly threshold = 100; // ms
  
  startMonitoring() {
    setInterval(() => {
      const start = performance.now();
      
      setImmediate(() => {
        const lag = performance.now() - start;
        
        if (lag > this.threshold) {
          console.warn(`Event loop lag detected: ${lag.toFixed(2)}ms`);
          // Alert or log metric
        }
      });
    }, 1000);
  }
}
```

### Metrics to Track

```typescript
import v8 from 'v8';

@Get('metrics')
getMetrics() {
  const heapStats = v8.getHeapStatistics();
  
  return {
    eventLoopDelay: this.getEventLoopDelay(),
    memory: {
      heapUsed: heapStats.used_heap_size,
      heapTotal: heapStats.total_heap_size,
      external: heapStats.external_memory
    },
    uptime: process.uptime(),
    cpuUsage: process.cpuUsage()
  };
}
```

## Best Practices

### 1. Never Block the Event Loop

```typescript
//  NEVER DO THIS
app.get('/bad', (req, res) => {
  const result = doHeavySync(); // Blocks everything!
  res.json(result);
});

//  DO THIS
app.get('/good', async (req, res) => {
  const result = await doHeavyAsync(); // Non-blocking
  res.json(result);
});
```

### 2. Use Streaming for Large Data

```typescript
//  Stream large responses
@Get('large-file')
downloadLargeFile(@Res() res: Response) {
  const fileStream = fs.createReadStream('/path/to/large-file.txt');
  fileStream.pipe(res);
}
```

### 3. Set Timeouts

```typescript
@Get('external-api')
async fetchExternal() {
  try {
    const response = await this.httpService.axiosRef.get(
      'https://slow-api.com/data',
      { timeout: 5000 } // 5 second timeout
    );
    return response.data;
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      throw new RequestTimeoutException('Request timed out');
    }
    throw error;
  }
}
```

### 4. Limit Payload Size

```typescript
// In main.ts
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
```

### 5. Use Connection Pooling

```typescript
// Database connection pool
const pool = new Pool({
  max: 20,                // Maximum connections
  min: 5,                 // Minimum connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

## Performance Comparison

### Blocking Example
```typescript
// Single instance handling requests sequentially
Request 1: CPU task (50s) → blocks
Request 2: Waiting... (50s)
Request 3: Waiting... (100s)

Total time: 150 seconds for 3 requests
```

### Non-Blocking Example
```typescript
// Single instance handling I/O concurrently
Request 1: DB query → continues
Request 2: API call → continues
Request 3: File read → continues

All complete in ~1 second (concurrent I/O)
```

### Horizontal Scaling for CPU Tasks
```typescript
// 3 instances with load balancer
Request 1: Instance 1 (CPU task 50s)
Request 2: Instance 2 (CPU task 50s)
Request 3: Instance 3 (CPU task 50s)

Total time: 50 seconds for 3 requests (parallel)
```

## Testing

Test event loop blocking in your application:

```bash
# Terminal 1: Start your service
npm run start:dev

# Terminal 2: Trigger CPU-intensive task
curl http://localhost:3000/api/cpu-intensive

# Terminal 3: Immediately try another request
time curl http://localhost:3000/api/health

# If blocked, health check will take a long time
```

## Project Implementation

See our implementation:
- [Cluster setup](../../../backend/apps/api-gateway/src/cluster.ts)
- [CPU-intensive test](../../../backend/test-scaling.sh)
- [Scaling demonstration](../../../backend/SCALING-DEMO.md)

## Next Steps

- Learn about [Scaling](../scaling/index.md) strategies
- Explore [Load Balancing](../load-balancer/index.md)
- Check [Observability](../observability/index.md) for monitoring

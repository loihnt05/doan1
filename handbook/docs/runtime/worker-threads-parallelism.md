---
sidebar_position: 5
---
# Worker Threads & Parallelism

## Worker Threads

Offload CPU-intensive tasks to separate threads:

**Main thread** (`main.js`):
```javascript
const { Worker } = require('worker_threads');

function runWorker(workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('./worker.js', { workerData });
    
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      }
    });
  });
}

// Use worker
const result = await runWorker({ numbers: [1, 2, 3, 4, 5] });
console.log('Result:', result);
```

**Worker thread** (`worker.js`):
```javascript
const { parentPort, workerData } = require('worker_threads');

// Perform heavy computation
function computeHeavyTask(data) {
  const sum = data.numbers.reduce((acc, num) => acc + num, 0);
  return { sum, count: data.numbers.length };
}

const result = computeHeavyTask(workerData);
parentPort.postMessage(result);
```

## Thread Pool Pattern

Reusable worker pool:

```javascript
const { Worker } = require('worker_threads');

class WorkerPool {
  constructor(workerScript, poolSize = 4) {
    this.workerScript = workerScript;
    this.poolSize = poolSize;
    this.workers = [];
    this.queue = [];
    
    for (let i = 0; i < poolSize; i++) {
      this.workers.push({ worker: null, busy: false });
    }
  }
  
  async exec(workerData) {
    return new Promise((resolve, reject) => {
      const availableWorker = this.workers.find(w => !w.busy);
      
      if (availableWorker) {
        this.runWorker(availableWorker, workerData, resolve, reject);
      } else {
        this.queue.push({ workerData, resolve, reject });
      }
    });
  }
  
  runWorker(workerSlot, workerData, resolve, reject) {
    workerSlot.busy = true;
    const worker = new Worker(this.workerScript, { workerData });
    
    worker.on('message', (result) => {
      resolve(result);
      worker.terminate();
      workerSlot.busy = false;
      this.processQueue();
    });
    
    worker.on('error', reject);
  }
  
  processQueue() {
    if (this.queue.length === 0) return;
    
    const availableWorker = this.workers.find(w => !w.busy);
    if (availableWorker) {
      const { workerData, resolve, reject } = this.queue.shift();
      this.runWorker(availableWorker, workerData, resolve, reject);
    }
  }
}

// Usage
const pool = new WorkerPool('./worker.js', 4);
const results = await Promise.all([
  pool.exec({ task: 1 }),
  pool.exec({ task: 2 }),
  pool.exec({ task: 3 }),
]);
```

## SharedArrayBuffer & Atomics

Share memory between threads:

```javascript
// Main thread
const { Worker } = require('worker_threads');

const sharedBuffer = new SharedArrayBuffer(4);
const sharedArray = new Int32Array(sharedBuffer);

const worker = new Worker('./worker.js', {
  workerData: { sharedBuffer }
});

// Atomic operations
Atomics.store(sharedArray, 0, 100);
Atomics.add(sharedArray, 0, 50);
console.log(Atomics.load(sharedArray, 0)); // 150

// Wait/notify pattern
Atomics.wait(sharedArray, 0, 150, 1000); // Wait for change
```

```javascript
// Worker thread
const { workerData } = require('worker_threads');
const sharedArray = new Int32Array(workerData.sharedBuffer);

// Modify shared memory
Atomics.add(sharedArray, 0, 25);
Atomics.notify(sharedArray, 0, 1); // Wake waiting thread
```

## structuredClone Performance

Fast deep cloning:

```javascript
const original = {
  data: [1, 2, 3],
  nested: { value: 'test' },
  date: new Date()
};

// ✅ Fast, preserves types
const clone1 = structuredClone(original);

// ❌ Slower, loses types
const clone2 = JSON.parse(JSON.stringify(original));

// Transferables for zero-copy
const buffer = new ArrayBuffer(1024);
const transferred = structuredClone(buffer, { transfer: [buffer] });
// Original buffer is now unusable (transferred ownership)
```

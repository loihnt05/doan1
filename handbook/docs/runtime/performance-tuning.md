---
sidebar_position: 6
---
# Performance Tuning

## Heap & GC Tuning

Configure V8 memory and garbage collection:

```bash
# Increase max heap size (default: ~1.4GB)
node --max-old-space-size=4096 app.js  # 4GB

# Expose GC for manual control
node --expose-gc app.js

# Optimize for latency
node --optimize-for-size app.js

# Enable pointer compression (reduce memory)
node --experimental-wasm-bigint app.js
```

**Monitor GC**:
```javascript
// Log GC events
node --trace-gc app.js

// Programmatic monitoring
const v8 = require('v8');
const heapStats = v8.getHeapStatistics();
console.log({
  totalHeap: heapStats.total_heap_size,
  usedHeap: heapStats.used_heap_size,
  heapLimit: heapStats.heap_size_limit
});

// Force GC (with --expose-gc flag)
if (global.gc) {
  global.gc();
}
```

## CPU Profiling

**Using Clinic.js**:
```bash
# Install
npm install -g clinic

# CPU profiling (flame graph)
clinic flame -- node app.js
# Opens interactive flamegraph in browser

# Detect event loop blocking
clinic doctor -- node app.js

# Heap profiling
clinic heapprofiler -- node app.js
```

**Built-in profiler**:
```bash
# Generate CPU profile
node --cpu-prof app.js
# Generates isolate-0x*.cpuprofile

# View in Chrome DevTools:
# 1. Open chrome://inspect
# 2. Click "Open dedicated DevTools for Node"
# 3. Go to Profiler tab
# 4. Load CPU profile file
```

## Memory Leak Detection

**Heap snapshots**:
```javascript
const v8 = require('v8');
const fs = require('fs');

// Take snapshot
const snapshotStream = v8.writeHeapSnapshot();
console.log('Heap snapshot written to:', snapshotStream);

// Compare snapshots over time:
// 1. Take snapshot at start
// 2. Run workload
// 3. Take snapshot after
// 4. Compare in Chrome DevTools Memory tab
```

**Using --inspect**:
```bash
node --inspect app.js

# In Chrome:
# 1. Navigate to chrome://inspect
# 2. Click "inspect" on your Node process
# 3. Go to Memory tab
# 4. Take heap snapshot
# 5. Run operations
# 6. Take another snapshot
# 7. Compare to find leaks
```

**Auto heap dump on OOM**:
```bash
node --heapsnapshot-signal=SIGUSR2 app.js

# Trigger snapshot
kill -USR2 <pid>
```

## Performance Hooks

Monitor performance metrics:

```javascript
const { PerformanceObserver, performance } = require('perf_hooks');

// Observe all entries
const obs = new PerformanceObserver((items) => {
  items.getEntries().forEach((entry) => {
    console.log(`${entry.name}: ${entry.duration}ms`);
  });
});
obs.observe({ entryTypes: ['measure', 'function'] });

// Mark points in code
performance.mark('start-operation');

// ... do work ...

performance.mark('end-operation');
performance.measure('operation-duration', 'start-operation', 'end-operation');

// HTTP timing
const obs2 = new PerformanceObserver((items) => {
  items.getEntries().forEach((entry) => {
    console.log({
      url: entry.name,
      duration: entry.duration,
      requestStart: entry.requestStart,
      responseEnd: entry.responseEnd
    });
  });
});
obs2.observe({ entryTypes: ['http'] });

// Function performance
const { performance, PerformanceMark } = require('perf_hooks');
const wrapped = performance.timerify(function expensiveFunction() {
  // Function code
});

wrapped(); // Automatically measured
```

## Best Practices

1. **Profile before optimizing** - Measure to find bottlenecks
2. **Avoid synchronous I/O** - Use async APIs
3. **Stream large data** - Don't load everything into memory
4. **Use Worker Threads** - For CPU-intensive tasks
5. **Monitor GC pauses** - Tune heap size if needed
6. **Cache aggressively** - Reduce redundant computation
7. **Use connection pooling** - For databases and HTTP
8. **Implement backpressure** - Control stream flow
9. **Enable clustering** - Utilize all CPU cores
10. **Regular profiling** - Continuous performance monitoring

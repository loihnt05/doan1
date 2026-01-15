---
sidebar_position: 1
---
# Runtime

Node.js runtime fundamentals, modern features, and performance optimization techniques.

## Overview

This section covers the core concepts and advanced features of the Node.js runtime environment. Understanding these topics is essential for building high-performance, scalable applications.

## Topics Covered

### [Event Loop & libuv](./event-loop-libuv.md)
Learn about the heart of Node.js - the event loop, how it processes asynchronous operations, and how libuv manages I/O operations.

**Key Topics:**
- Event Loop phases and execution flow
- Microtask vs Macrotask queues
- libuv Thread Pool configuration
- Blocking vs Non-blocking operations
- Async Hooks for monitoring asynchronous resources

### [Node.js v23 Features](./nodejs-v23-features.md)
Explore the latest features in Node.js v23 that improve developer experience and application security.

**Key Topics:**
- Native TypeScript support with `--experimental-strip-types`
- On-disk Code Caching for faster startup
- Module Loader Hooks for custom resolution
- Permission Model for sandboxing and security

### [Built-in Web APIs](./builtin-web-apis.md)
Discover the modern web APIs now available natively in Node.js without external dependencies.

**Key Topics:**
- WebSocket Stable API
- URL Pattern API for routing
- Web Streams standard
- Native Fetch API
- Scheduler API for task prioritization

### [Worker Threads & Parallelism](./worker-threads-parallelism.md)
Master parallel computing in Node.js using Worker Threads to handle CPU-intensive operations.

**Key Topics:**
- Worker Threads basics and patterns
- Worker Pool implementation
- SharedArrayBuffer & Atomics for shared memory
- structuredClone for efficient data transfer

### [Performance Tuning](./performance-tuning.md)
Learn techniques and tools to optimize your Node.js applications for maximum performance.

**Key Topics:**
- Heap & Garbage Collection tuning
- CPU Profiling with clinic.js
- Memory Leak detection
- Performance Hooks for monitoring
- Best practices for high-performance applications

## Why Runtime Matters

Understanding the Node.js runtime is crucial for:

- **Performance**: Knowing how to avoid blocking the event loop
- **Scalability**: Properly utilizing multiple cores and worker threads
- **Debugging**: Understanding async flows and timing
- **Optimization**: Using the right tools to identify bottlenecks
- **Security**: Leveraging permission models and sandboxing

## Quick Start

If you're new to Node.js runtime concepts, start with:

1. [Event Loop & libuv](./event-loop-libuv.md) - Understand the foundation
2. [Built-in Web APIs](./builtin-web-apis.md) - Learn modern Node.js features
3. [Performance Tuning](./performance-tuning.md) - Apply best practices

For production applications, make sure to read all sections to build robust, performant systems.

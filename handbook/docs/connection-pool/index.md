# Connection Pool

## Overview

A connection pool is a cache of database connections maintained so that connections can be reused rather than creating new ones for each request. This significantly improves performance and resource utilization.

## Why Connection Pooling?

### Without Connection Pool
```typescript
//  BAD: Create new connection every time
async getUser(id: string) {
  const connection = await createConnection(); // Expensive!
  const user = await connection.query('SELECT * FROM users WHERE id = $1', [id]);
  await connection.close();
  return user;
}

// Each request:
// 1. TCP handshake (network round trip)
// 2. Authentication (CPU + network)
// 3. Query execution
// 4. Connection teardown
// Total: ~50-100ms overhead PER REQUEST!
```

### With Connection Pool
```typescript
//  GOOD: Reuse connections
async getUser(id: string) {
  const connection = await pool.acquire(); // Fast! (~1ms)
  const user = await connection.query('SELECT * FROM users WHERE id = $1', [id]);
  await pool.release(connection);
  return user;
}

// Connections are reused:
// 1. Acquire from pool (~1ms)
// 2. Query execution
// 3. Return to pool
// Total: Minimal overhead!
```

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Application                        │
│                                                     │
│  Request 1 ──┐                                     │
│  Request 2 ──┤                                     │
│  Request 3 ──┤                                     │
│  Request 4 ──┘                                     │
└──────────────┬──────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│              Connection Pool                        │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  Conn 1  │  │  Conn 2  │  │  Conn 3  │  ← In use
│  │ (Active) │  │ (Active) │  │ (Active) │        │
│  └──────────┘  └──────────┘  └──────────┘        │
│                                                     │
│  ┌──────────┐  ┌──────────┐                       │
│  │  Conn 4  │  │  Conn 5  │  ← Available          │
│  │  (Idle)  │  │  (Idle)  │                       │
│  └──────────┘  └──────────┘                       │
│                                                     │
│  Request Queue: [Req5, Req6, Req7]  ← Waiting     │
└─────────────────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────────────────┐
│               Database Server                       │
└─────────────────────────────────────────────────────┘
```

## Core Components

### 1. Pool Manager

Manages the lifecycle of connections.

```typescript
export class ConnectionPool {
  private availableConnections: Connection[] = [];
  private activeConnections = new Set<Connection>();
  private waitingQueue: Array<(conn: Connection) => void> = [];
  
  constructor(
    private readonly minSize: number = 5,
    private readonly maxSize: number = 20,
    private readonly idleTimeoutMs: number = 30000,
    private readonly connectionTimeoutMs: number = 5000
  ) {
    this.initialize();
  }

  private async initialize() {
    // Create minimum connections
    for (let i = 0; i < this.minSize; i++) {
      const conn = await this.createConnection();
      this.availableConnections.push(conn);
    }

    // Start idle connection cleanup
    this.startIdleConnectionCleanup();
  }

  async createConnection(): Promise<Connection> {
    return new Connection({
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });
  }
}
```

### 2. Connection Objects

Individual database connections.

```typescript
export class Connection {
  public lastUsedAt: Date;
  public createdAt: Date;
  public isHealthy: boolean = true;
  private nativeConnection: any;

  constructor(config: ConnectionConfig) {
    this.nativeConnection = this.connect(config);
    this.createdAt = new Date();
    this.lastUsedAt = new Date();
  }

  async query(sql: string, params: any[]): Promise<any> {
    this.lastUsedAt = new Date();
    return this.nativeConnection.query(sql, params);
  }

  async close(): Promise<void> {
    await this.nativeConnection.end();
  }

  getIdleTime(): number {
    return Date.now() - this.lastUsedAt.getTime();
  }
}
```

### 3. Acquisition/Release Logic

```typescript
export class ConnectionPool {
  async acquire(): Promise<Connection> {
    // Try to get available connection
    if (this.availableConnections.length > 0) {
      const conn = this.availableConnections.pop()!;
      this.activeConnections.add(conn);
      return conn;
    }

    // Create new connection if under max limit
    const totalConnections = 
      this.availableConnections.length + this.activeConnections.size;
    
    if (totalConnections < this.maxSize) {
      const conn = await this.createConnection();
      this.activeConnections.add(conn);
      return conn;
    }

    // Wait for available connection
    return this.waitForConnection();
  }

  async release(conn: Connection): Promise<void> {
    this.activeConnections.delete(conn);

    // Health check before returning to pool
    if (await this.isHealthy(conn)) {
      // Check if someone is waiting
      if (this.waitingQueue.length > 0) {
        const resolve = this.waitingQueue.shift()!;
        this.activeConnections.add(conn);
        resolve(conn);
      } else {
        this.availableConnections.push(conn);
      }
    } else {
      // Connection unhealthy, close it
      await conn.close();
    }
  }

  private async waitForConnection(): Promise<Connection> {
    return new Promise((resolve, reject) => {
      this.waitingQueue.push(resolve);

      // Timeout if waiting too long
      setTimeout(() => {
        const index = this.waitingQueue.indexOf(resolve);
        if (index > -1) {
          this.waitingQueue.splice(index, 1);
          reject(new Error('Connection acquisition timeout'));
        }
      }, this.connectionTimeoutMs);
    });
  }
}
```

### 4. Queue / Request Handling

```typescript
export class ConnectionPool {
  getQueueSize(): number {
    return this.waitingQueue.length;
  }

  getActiveConnections(): number {
    return this.activeConnections.size;
  }

  getAvailableConnections(): number {
    return this.availableConnections.length;
  }

  getPoolStatus() {
    return {
      active: this.activeConnections.size,
      available: this.availableConnections.length,
      waiting: this.waitingQueue.length,
      total: this.activeConnections.size + this.availableConnections.length
    };
  }
}
```

### 5. Idle Timeout

Close connections that have been idle too long.

```typescript
export class ConnectionPool {
  private startIdleConnectionCleanup() {
    setInterval(() => {
      const now = Date.now();

      // Check idle connections
      for (let i = this.availableConnections.length - 1; i >= 0; i--) {
        const conn = this.availableConnections[i];
        const idleTime = conn.getIdleTime();

        // Close if idle too long and above minimum
        if (
          idleTime > this.idleTimeoutMs &&
          this.availableConnections.length > this.minSize
        ) {
          this.availableConnections.splice(i, 1);
          conn.close();
          console.log(`Closed idle connection (idle for ${idleTime}ms)`);
        }
      }
    }, 10000); // Check every 10 seconds
  }
}
```

### 6. Max/Min Connections

```typescript
export interface PoolConfig {
  minSize: number;      // Minimum connections to maintain
  maxSize: number;      // Maximum connections allowed
  idleTimeout: number;  // Close idle connections after (ms)
  connectionTimeout: number; // Max wait time for connection (ms)
}

// Example configurations

// Development
const devConfig: PoolConfig = {
  minSize: 2,
  maxSize: 10,
  idleTimeout: 30000,
  connectionTimeout: 5000
};

// Production - high traffic
const prodConfig: PoolConfig = {
  minSize: 10,
  maxSize: 50,
  idleTimeout: 60000,
  connectionTimeout: 10000
};

// Production - low traffic
const lowTrafficConfig: PoolConfig = {
  minSize: 5,
  maxSize: 20,
  idleTimeout: 120000,
  connectionTimeout: 5000
};
```

### 7. Health Check & Reconnect

```typescript
export class ConnectionPool {
  private async isHealthy(conn: Connection): Promise<boolean> {
    try {
      // Simple health check query
      await conn.query('SELECT 1', []);
      conn.isHealthy = true;
      return true;
    } catch (error) {
      console.error('Connection health check failed:', error);
      conn.isHealthy = false;
      return false;
    }
  }

  private startHealthChecks() {
    setInterval(async () => {
      // Check all available connections
      for (const conn of this.availableConnections) {
        if (!await this.isHealthy(conn)) {
          // Remove unhealthy connection
          const index = this.availableConnections.indexOf(conn);
          this.availableConnections.splice(index, 1);
          await conn.close();

          // Create replacement if below minimum
          if (this.availableConnections.length < this.minSize) {
            try {
              const newConn = await this.createConnection();
              this.availableConnections.push(newConn);
            } catch (error) {
              console.error('Failed to create replacement connection:', error);
            }
          }
        }
      }
    }, 30000); // Every 30 seconds
  }

  private async reconnect(conn: Connection): Promise<Connection> {
    try {
      await conn.close();
    } catch (error) {
      // Ignore close errors
    }

    return this.createConnection();
  }
}
```

### 8. Configuration Options

```typescript
export interface PoolOptions {
  // Connection limits
  min: number;
  max: number;

  // Timeouts
  acquireTimeoutMillis: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  reapIntervalMillis: number;

  // Connection creation
  createRetryIntervalMillis: number;
  createTimeoutMillis: number;

  // Validation
  validateOnBorrow: boolean;
  testOnBorrow: boolean;

  // Error handling
  propagateCreateError: boolean;
  
  // Logging
  log: (message: string) => void;
}

const pool = new ConnectionPool({
  min: 5,
  max: 20,
  acquireTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  reapIntervalMillis: 10000,
  validateOnBorrow: true,
  testOnBorrow: true,
  log: (msg) => console.log(`[Pool] ${msg}`)
});
```

### 9. Backpressure Handling

When pool is saturated, handle gracefully.

```typescript
export class ConnectionPool {
  async acquire(): Promise<Connection> {
    // Check queue size
    if (this.waitingQueue.length > 100) {
      // Too many waiting, reject immediately
      throw new PoolExhaustedError(
        'Connection pool exhausted - too many waiting requests'
      );
    }

    // ... normal acquisition logic
  }

  // Metrics for backpressure monitoring
  getBackpressureMetrics() {
    const queueSize = this.waitingQueue.length;
    const utilizationPercent = 
      (this.activeConnections.size / this.maxSize) * 100;

    return {
      queueSize,
      utilizationPercent,
      isUnderPressure: queueSize > 50 || utilizationPercent > 90
    };
  }
}
```

## Usage with TypeORM

```typescript
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'user',
      password: 'password',
      database: 'mydb',
      
      // Connection pool configuration
      extra: {
        max: 20,                    // Maximum pool size
        min: 5,                     // Minimum pool size
        idleTimeoutMillis: 30000,   // Close idle connections
        connectionTimeoutMillis: 5000,
        
        // Query timeout
        statement_timeout: 10000,   // 10 seconds
        
        // Keep-alive
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000
      }
    })
  ]
})
export class AppModule {}
```

## Usage with Prisma

```typescript
// schema.prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["metrics"]
}

// Connection pool configuration via URL
// postgresql://user:password@localhost:5432/mydb?connection_limit=20&pool_timeout=10

// Or programmatically
const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Prisma automatically manages connection pooling
```

## Best Practices

### 1. Size the Pool Correctly

```
Formula: connections = ((core_count * 2) + effective_spindle_count)

For modern SSDs (no spindles):
connections = core_count * 2

Example:
- 4 CPU cores → 8 connections
- 8 CPU cores → 16 connections
```

### 2. Use Transactions Properly

```typescript
//  GOOD: Release connection quickly
async transferMoney(from: string, to: string, amount: number) {
  const connection = await pool.acquire();
  
  try {
    await connection.query('BEGIN');
    await connection.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, from]);
    await connection.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, to]);
    await connection.query('COMMIT');
  } catch (error) {
    await connection.query('ROLLBACK');
    throw error;
  } finally {
    await pool.release(connection); // Always release!
  }
}

//  BAD: Hold connection during external call
async badExample() {
  const connection = await pool.acquire();
  
  await connection.query('SELECT ...');
  await fetch('https://slow-api.com/data'); // Blocks connection!
  await connection.query('INSERT ...');
  
  await pool.release(connection);
}
```

### 3. Monitor Pool Metrics

```typescript
@Injectable()
export class PoolMonitor {
  constructor(private pool: ConnectionPool) {
    this.startMonitoring();
  }

  private startMonitoring() {
    setInterval(() => {
      const status = this.pool.getPoolStatus();
      const backpressure = this.pool.getBackpressureMetrics();

      console.log('Pool Status:', {
        active: status.active,
        available: status.available,
        waiting: status.waiting,
        utilization: `${backpressure.utilizationPercent.toFixed(1)}%`,
        underPressure: backpressure.isUnderPressure
      });

      // Alert if under pressure
      if (backpressure.isUnderPressure) {
        this.alertOps('Connection pool under pressure!');
      }
    }, 60000); // Every minute
  }
}
```

### 4. Graceful Shutdown

```typescript
async function shutdown() {
  console.log('Shutting down...');

  // Stop accepting new requests
  await app.close();

  // Drain the pool
  await pool.drain();

  // Close all connections
  await pool.clear();

  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
```

## Troubleshooting

### Connection Leaks

```typescript
// Enable leak detection
const pool = new ConnectionPool({
  max: 20,
  acquireTimeoutMillis: 10000,
  
  // Log slow acquisitions
  logSlowAcquisitions: true,
  slowAcquisitionThresholdMs: 1000,
  
  // Track connection usage
  trackConnectionUsage: true
});

// Find connections held too long
pool.on('connectionHeldTooLong', (conn, duration) => {
  console.error(`Connection held for ${duration}ms:`, conn.stack);
});
```

### Pool Exhaustion

```typescript
// Monitor and alert
if (pool.getAvailableConnections() === 0 && pool.getQueueSize() > 10) {
  console.error('Pool exhausted!', {
    active: pool.getActiveConnections(),
    waiting: pool.getQueueSize(),
    total: pool.getPoolStatus().total
  });

  // Temporarily increase pool size
  if (pool.getMaxSize() < 50) {
    pool.setMaxSize(pool.getMaxSize() + 10);
  }
}
```

## Project Implementation

Connection pooling is configured in:
- [Database configuration](../../../backend/apps/user-service/src/database.config.ts)
- [Connection pool docs](../../../handbook/docs/connection-pool/)

## Next Steps

- Learn about [Distributed Locking](../distributed-locking/index.md)
- Explore [Database Scaling](../scaling/database.md)
- Check [Observability](../observability/index.md)

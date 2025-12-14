import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DemoConnection } from '../connection/demo-connection';
import { ConnectionState } from '../types/connection.interface';
import {
  DEFAULT_POOL_CONFIG,
  PoolConfig,
} from '../types/pool-config.interface';

/**
 * Connection request in queue
 */
interface ConnectionRequest {
  resolve: (connection: DemoConnection) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeoutId?: NodeJS.Timeout;
}

/**
 * Pool statistics
 */
export interface PoolStats {
  totalConnections: number;
  idleConnections: number;
  activeConnections: number;
  pendingRequests: number;
  failedConnections: number;
  totalAcquired: number;
  totalReleased: number;
  totalCreated: number;
  totalDestroyed: number;
  queueOverflows: number;
}

/**
 * Connection Pool Manager
 * Manages a pool of connections with acquisition/release logic, queuing, health checks, and backpressure handling
 */
@Injectable()
export class ConnectionPoolManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConnectionPoolManager.name);

  private connections: Set<DemoConnection> = new Set();
  private idleConnections: DemoConnection[] = [];
  private activeConnections: Set<DemoConnection> = new Set();
  private requestQueue: ConnectionRequest[] = [];

  private healthCheckInterval?: NodeJS.Timeout;
  private idleCheckInterval?: NodeJS.Timeout;

  private config: PoolConfig;

  // Statistics
  private stats: PoolStats = {
    totalConnections: 0,
    idleConnections: 0,
    activeConnections: 0,
    pendingRequests: 0,
    failedConnections: 0,
    totalAcquired: 0,
    totalReleased: 0,
    totalCreated: 0,
    totalDestroyed: 0,
    queueOverflows: 0,
  };

  private isShuttingDown = false;

  constructor(config?: Partial<PoolConfig>) {
    this.config = { ...DEFAULT_POOL_CONFIG, ...config };
  }

  /**
   * Initialize the pool
   */
  async onModuleInit() {
    this.logger.log('Initializing connection pool...');
    await this.initializePool();
    this.startHealthChecks();
    this.startIdleConnectionCleaner();
    this.logger.log(
      `Connection pool initialized with ${this.connections.size} connections`,
    );
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy() {
    this.logger.log('Shutting down connection pool...');
    this.isShuttingDown = true;

    // Stop intervals
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    if (this.idleCheckInterval) {
      clearInterval(this.idleCheckInterval);
    }

    // Reject pending requests
    this.requestQueue.forEach((req) => {
      req.reject(new Error('Pool is shutting down'));
      if (req.timeoutId) clearTimeout(req.timeoutId);
    });
    this.requestQueue = [];

    // Close all connections
    await this.closeAllConnections();
    this.logger.log('Connection pool shut down complete');
  }

  /**
   * Initialize the pool with minimum connections
   */
  private async initializePool(): Promise<void> {
    const promises: Promise<void>[] = [];

    for (let i = 0; i < this.config.minConnections; i++) {
      promises.push(this.createConnection());
    }

    await Promise.allSettled(promises);
  }

  /**
   * Create a new connection
   */
  private async createConnection(): Promise<void> {
    if (this.connections.size >= this.config.maxConnections) {
      throw new Error('Maximum connection limit reached');
    }

    const connection = new DemoConnection();

    try {
      await connection.connect();
      this.connections.add(connection);
      this.idleConnections.push(connection);
      this.stats.totalCreated++;
      this.updateStats();

      this.logger.debug(
        `Created new connection ${connection.id}. Total: ${this.connections.size}`,
      );
    } catch (error) {
      this.logger.error(`Failed to create connection: ${error.message}`);
      this.stats.failedConnections++;
      throw error;
    }
  }

  /**
   * Acquire a connection from the pool
   * Implements queue and backpressure handling
   */
  async acquire(): Promise<DemoConnection> {
    if (this.isShuttingDown) {
      throw new Error('Pool is shutting down');
    }

    // Try to get an idle connection immediately
    const connection = await this.tryAcquireImmediate();
    if (connection) {
      return connection;
    }

    // Check backpressure - queue is full
    if (this.requestQueue.length >= this.config.maxQueueSize) {
      this.stats.queueOverflows++;
      this.logger.warn(
        `Connection request queue is full (${this.requestQueue.length}/${this.config.maxQueueSize})`,
      );
      throw new Error(
        'Connection pool queue is full - backpressure limit reached',
      );
    }

    // Queue the request
    return new Promise<DemoConnection>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.requestQueue.findIndex(
          (req) => req.resolve === resolve,
        );
        if (index !== -1) {
          this.requestQueue.splice(index, 1);
          this.updateStats();
        }
        reject(
          new Error(
            `Connection acquisition timeout after ${this.config.acquireTimeoutMs}ms`,
          ),
        );
      }, this.config.acquireTimeoutMs);

      const request: ConnectionRequest = {
        resolve,
        reject,
        timestamp: Date.now(),
        timeoutId,
      };

      this.requestQueue.push(request);
      this.updateStats();

      this.logger.debug(
        `Request queued. Queue size: ${this.requestQueue.length}`,
      );

      // Try to create a new connection if possible
      if (this.connections.size < this.config.maxConnections) {
        this.createConnection()
          .then(() => this.processQueue())
          .catch((error) => {
            this.logger.error(
              `Failed to create connection for queued request: ${error.message}`,
            );
          });
      }
    });
  }

  /**
   * Try to acquire a connection immediately
   */
  private async tryAcquireImmediate(): Promise<DemoConnection | null> {
    // Check for idle connections
    while (this.idleConnections.length > 0) {
      const connection = this.idleConnections.pop();
      
      if (!connection) {
        break;
      }

      // Validate connection if configured
      if (this.config.validateBeforeUse) {
        const isHealthy = await connection.isHealthy();
        if (!isHealthy) {
          this.logger.warn(
            `Connection ${connection.id} failed validation, removing`,
          );
          await this.removeConnection(connection);
          continue;
        }
      }

      connection.markInUse();
      this.activeConnections.add(connection);
      this.stats.totalAcquired++;
      this.updateStats();

      this.logger.debug(`Acquired connection ${connection.id}`);
      return connection;
    }

    // Try to create a new connection if under limit
    if (this.connections.size < this.config.maxConnections) {
      try {
        await this.createConnection();
        return this.tryAcquireImmediate();
      } catch (error) {
        this.logger.error(`Failed to create connection: ${error.message}`);
      }
    }

    return null;
  }

  /**
   * Release a connection back to the pool
   */
  async release(connection: DemoConnection): Promise<void> {
    if (!this.connections.has(connection)) {
      this.logger.warn(
        `Attempted to release unknown connection ${connection.id}`,
      );
      return;
    }

    this.activeConnections.delete(connection);
    connection.markIdle();
    this.stats.totalReleased++;

    // Check if there are pending requests
    if (this.requestQueue.length > 0) {
      this.logger.debug(
        `Processing queue on release. Queue size: ${this.requestQueue.length}`,
      );
      this.processQueue();
    } else {
      this.idleConnections.push(connection);
      this.updateStats();
    }

    this.logger.debug(`Released connection ${connection.id}`);
  }

  /**
   * Process queued connection requests
   */
  private processQueue(): void {
    while (this.requestQueue.length > 0 && this.idleConnections.length > 0) {
      const request = this.requestQueue.shift();
      const connection = this.idleConnections.pop();

      if (request && connection) {
        if (request.timeoutId) {
          clearTimeout(request.timeoutId);
        }

        connection.markInUse();
        this.activeConnections.add(connection);
        this.stats.totalAcquired++;
        this.updateStats();

        request.resolve(connection);
        this.logger.debug(
          `Served queued request with connection ${connection.id}`,
        );
      }
    }

    this.updateStats();
  }

  /**
   * Remove a connection from the pool
   */
  private async removeConnection(connection: DemoConnection): Promise<void> {
    this.connections.delete(connection);
    this.activeConnections.delete(connection);

    const idleIndex = this.idleConnections.indexOf(connection);
    if (idleIndex !== -1) {
      this.idleConnections.splice(idleIndex, 1);
    }

    try {
      await connection.disconnect();
      this.stats.totalDestroyed++;
      this.logger.debug(
        `Removed connection ${connection.id}. Total: ${this.connections.size}`,
      );
    } catch (error) {
      this.logger.error(
        `Error disconnecting connection ${connection.id}: ${error.message}`,
      );
    }

    this.updateStats();

    // Ensure we maintain minimum connections
    if (this.connections.size < this.config.minConnections) {
      this.createConnection().catch((error) => {
        this.logger.error(
          `Failed to create replacement connection: ${error.message}`,
        );
      });
    }
  }

  /**
   * Start health check interval
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      this.logger.debug('Running health checks...');
      await this.performHealthChecks();
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Perform health checks on all idle connections
   */
  async performHealthChecks(): Promise<void> {
    const healthCheckPromises = Array.from(this.connections).map(
      async (connection) => {
        // Only check idle connections
        if (connection.state !== ConnectionState.IDLE) {
          return;
        }

        try {
          const isHealthy = await connection.isHealthy();

          if (!isHealthy) {
            this.logger.warn(
              `Connection ${connection.id} is unhealthy, attempting to reconnect`,
            );
            this.stats.failedConnections++;

            // Attempt to reconnect
            if (connection.failureCount < this.config.maxRetries) {
              await this.delay(this.config.retryDelayMs);
              await connection.reset();
              this.logger.log(
                `Connection ${connection.id} successfully reconnected`,
              );
            } else {
              this.logger.error(
                `Connection ${connection.id} exceeded max retries, removing`,
              );
              await this.removeConnection(connection);
            }
          }
        } catch (error) {
          this.logger.error(
            `Health check failed for connection ${connection.id}: ${error.message}`,
          );
          await this.removeConnection(connection);
        }
      },
    );

    await Promise.allSettled(healthCheckPromises);
  }

  /**
   * Start idle connection cleaner
   */
  private startIdleConnectionCleaner(): void {
    this.idleCheckInterval = setInterval(() => {
      this.cleanIdleConnections();
    }, this.config.idleTimeoutMs / 2);
  }

  /**
   * Clean up idle connections that have exceeded the idle timeout
   */
  private cleanIdleConnections(): void {
    const now = Date.now();
    const connectionsToRemove: DemoConnection[] = [];

    for (const connection of this.idleConnections) {
      if (connection.isIdleFor(this.config.idleTimeoutMs)) {
        // Don't remove if it would go below minimum
        if (
          this.connections.size - connectionsToRemove.length >
          this.config.minConnections
        ) {
          connectionsToRemove.push(connection);
          this.logger.debug(
            `Connection ${connection.id} has been idle for too long, removing`,
          );
        }
      }
    }

    connectionsToRemove.forEach((connection) => {
      this.removeConnection(connection);
    });
  }

  /**
   * Close all connections
   */
  private async closeAllConnections(): Promise<void> {
    const closePromises = Array.from(this.connections).map((connection) =>
      connection
        .disconnect()
        .catch((error) =>
          this.logger.error(
            `Error closing connection ${connection.id}: ${error.message}`,
          ),
        ),
    );

    await Promise.allSettled(closePromises);

    this.connections.clear();
    this.idleConnections = [];
    this.activeConnections.clear();
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return { ...this.stats };
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.totalConnections = this.connections.size;
    this.stats.idleConnections = this.idleConnections.length;
    this.stats.activeConnections = this.activeConnections.size;
    this.stats.pendingRequests = this.requestQueue.length;
  }

  /**
   * Get configuration
   */
  getConfig(): PoolConfig {
    return { ...this.config };
  }

  /**
   * Utility delay method
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Execute a function with an acquired connection
   */
  async executeWithConnection<T>(
    fn: (connection: DemoConnection) => Promise<T>,
  ): Promise<T> {
    const connection = await this.acquire();

    try {
      const result = await fn(connection);
      await this.release(connection);
      return result;
    } catch (error) {
      // Release connection even on error
      await this.release(connection);
      throw error;
    }
  }
}

/**
 * Connection Pool Configuration
 */
export interface PoolConfig {
  /**
   * Minimum number of connections to maintain
   */
  minConnections: number;

  /**
   * Maximum number of connections allowed
   */
  maxConnections: number;

  /**
   * Time in milliseconds before a connection is considered idle
   */
  idleTimeoutMs: number;

  /**
   * Maximum time to wait for a connection before timing out
   */
  acquireTimeoutMs: number;

  /**
   * Interval for health checks in milliseconds
   */
  healthCheckIntervalMs: number;

  /**
   * Maximum number of retries for failed connections
   */
  maxRetries: number;

  /**
   * Time to wait before retrying a failed connection
   */
  retryDelayMs: number;

  /**
   * Maximum queue size for pending connection requests
   */
  maxQueueSize: number;

  /**
   * Enable/disable connection validation before use
   */
  validateBeforeUse: boolean;

  /**
   * Connection timeout in milliseconds
   */
  connectionTimeoutMs: number;
}

/**
 * Default pool configuration
 */
export const DEFAULT_POOL_CONFIG: PoolConfig = {
  minConnections: 2,
  maxConnections: 10,
  idleTimeoutMs: 30000, // 30 seconds
  acquireTimeoutMs: 5000, // 5 seconds
  healthCheckIntervalMs: 60000, // 1 minute
  maxRetries: 3,
  retryDelayMs: 1000,
  maxQueueSize: 50,
  validateBeforeUse: true,
  connectionTimeoutMs: 5000,
};

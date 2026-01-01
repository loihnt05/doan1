import { Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ConnectionState, IConnection } from '../types/connection.interface';

/**
 * Mock connection implementation for demo purposes
 * In a real scenario, this would be a database connection, API client, etc.
 */
export class DemoConnection implements IConnection {
  private readonly logger = new Logger(DemoConnection.name);

  id: string;
  state: ConnectionState;
  createdAt: Date;
  lastUsedAt: Date;
  failureCount: number;

  private mockData: any;
  private simulateFailure: boolean = false;

  constructor() {
    this.id = randomUUID();
    this.state = ConnectionState.DISCONNECTED;
    this.createdAt = new Date();
    this.lastUsedAt = new Date();
    this.failureCount = 0;
  }

  /**
   * Establish a connection
   */
  async connect(): Promise<void> {
    this.logger.debug(`Connecting connection ${this.id}`);
    this.state = ConnectionState.CONNECTING;

    // Simulate connection delay
    await this.delay(100);

    if (this.simulateFailure && Math.random() < 0.2) {
      this.state = ConnectionState.FAILED;
      this.failureCount++;
      throw new Error(`Connection ${this.id} failed to connect`);
    }

    this.state = ConnectionState.IDLE;
    this.mockData = { connected: true, timestamp: new Date() };
    this.logger.debug(`Connection ${this.id} established`);
  }

  /**
   * Disconnect the connection
   */
  async disconnect(): Promise<void> {
    this.logger.debug(`Disconnecting connection ${this.id}`);

    // Simulate disconnection delay
    await this.delay(50);

    this.state = ConnectionState.DISCONNECTED;
    this.mockData = null;
    this.logger.debug(`Connection ${this.id} disconnected`);
  }

  /**
   * Check if the connection is healthy
   */
  async isHealthy(): Promise<boolean> {
    if (
      this.state === ConnectionState.DISCONNECTED ||
      this.state === ConnectionState.FAILED
    ) {
      return false;
    }

    // Simulate health check
    await this.delay(10);

    // Randomly fail 5% of health checks
    if (this.simulateFailure && Math.random() < 0.05) {
      this.logger.warn(`Connection ${this.id} failed health check`);
      this.state = ConnectionState.FAILED;
      this.failureCount++;
      return false;
    }

    return true;
  }

  /**
   * Reset the connection
   */
  async reset(): Promise<void> {
    this.logger.debug(`Resetting connection ${this.id}`);
    await this.disconnect();
    await this.connect();
    this.failureCount = 0;
  }

  /**
   * Mark connection as in use
   */
  markInUse(): void {
    this.state = ConnectionState.IN_USE;
    this.lastUsedAt = new Date();
  }

  /**
   * Mark connection as idle
   */
  markIdle(): void {
    this.state = ConnectionState.IDLE;
    this.lastUsedAt = new Date();
  }

  /**
   * Check if connection is idle for too long
   */
  isIdleFor(milliseconds: number): boolean {
    if (this.state !== ConnectionState.IDLE) {
      return false;
    }
    const idleTime = Date.now() - this.lastUsedAt.getTime();
    return idleTime > milliseconds;
  }

  /**
   * Execute a query (demo method)
   */
  async executeQuery(query: string): Promise<any> {
    if (this.state !== ConnectionState.IN_USE) {
      throw new Error(`Connection ${this.id} is not in use`);
    }

    this.logger.debug(`Executing query on connection ${this.id}: ${query}`);

    // Simulate query execution
    await this.delay(50 + Math.random() * 100);

    return {
      success: true,
      data: `Result for: ${query}`,
      connectionId: this.id,
      timestamp: new Date(),
    };
  }

  /**
   * Enable failure simulation for testing
   */
  enableFailureSimulation(): void {
    this.simulateFailure = true;
  }

  /**
   * Disable failure simulation
   */
  disableFailureSimulation(): void {
    this.simulateFailure = false;
  }

  /**
   * Utility delay method
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

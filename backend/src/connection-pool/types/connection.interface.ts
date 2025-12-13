/**
 * Connection state enumeration
 */
export enum ConnectionState {
  IDLE = 'IDLE',
  IN_USE = 'IN_USE',
  CONNECTING = 'CONNECTING',
  DISCONNECTED = 'DISCONNECTED',
  FAILED = 'FAILED',
}

/**
 * Connection interface
 */
export interface IConnection {
  id: string;
  state: ConnectionState;
  createdAt: Date;
  lastUsedAt: Date;
  failureCount: number;

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isHealthy(): Promise<boolean>;
  reset(): Promise<void>;
}

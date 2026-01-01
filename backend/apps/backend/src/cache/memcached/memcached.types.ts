export interface MemcachedOptions {
  retries?: number;
  retry?: number;
  remove?: boolean;
  failOverServers?: string[];
  timeout?: number;
  idle?: number;
}

export interface FailureDetails {
  server: string;
  messages: string[];
}

export interface ReconnectingDetails {
  server: string;
  totalDownTime: number;
}

// Type definition for Memcached client
export interface MemcachedClient {
  on(event: 'failure', callback: (details: FailureDetails) => void): void;
  on(
    event: 'reconnecting',
    callback: (details: ReconnectingDetails) => void,
  ): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  end(): void;
  get<T>(
    key: string,
    callback: (err: Error | undefined, data: T) => void,
  ): void;
  set(
    key: string,
    value: unknown,
    lifetime: number,
    callback: (err: Error | undefined) => void,
  ): void;
  del(key: string, callback: (err: Error | undefined) => void): void;
  add(
    key: string,
    value: unknown,
    lifetime: number,
    callback: (err: Error | undefined) => void,
  ): void;
  replace(
    key: string,
    value: unknown,
    lifetime: number,
    callback: (err: Error | undefined) => void,
  ): void;
  getMulti<T>(
    keys: string[],
    callback: (err: Error | undefined, data: Record<string, T>) => void,
  ): void;
  incr(
    key: string,
    amount: number,
    callback: (err: Error | undefined, result: number | false) => void,
  ): void;
  decr(
    key: string,
    amount: number,
    callback: (err: Error | undefined, result: number | false) => void,
  ): void;
  flush(callback: (err: Error | undefined) => void): void;
  stats(
    callback: (err: Error | undefined, stats: Record<string, unknown>) => void,
  ): void;
}

// Type for the Memcached constructor
export interface MemcachedConstructor {
  new (servers: string | string[], options?: MemcachedOptions): MemcachedClient;
}

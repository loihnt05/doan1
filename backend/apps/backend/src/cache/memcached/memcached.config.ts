import { MemcachedOptions } from './memcached.types';

export const MEMCACHED_CONFIG: {
  servers: string | string[];
  options: MemcachedOptions;
} = {
  servers: '127.0.0.1:11211',
  options: {
    retries: 10,
    retry: 10000,
    remove: true,
    failOverServers: [],
    timeout: 5000,
    idle: 5000,
  },
};

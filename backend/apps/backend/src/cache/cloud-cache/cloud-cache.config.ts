export interface CloudCacheConfig {
  defaultMaxAge: number; // Default TTL in seconds
  enableCleanup: boolean; // Auto cleanup expired entries
  cleanupInterval: number; // Cleanup interval in milliseconds
}

export const defaultCloudCacheConfig: CloudCacheConfig = {
  defaultMaxAge: 10, // 10 seconds (similar to Cloudflare examples)
  enableCleanup: true,
  cleanupInterval: 60000, // 1 minute
};

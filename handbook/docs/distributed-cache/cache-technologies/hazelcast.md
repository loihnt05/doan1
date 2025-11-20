# Hazelcast

Hazelcast is an open-source in-memory data grid that provides distributed caching, distributed computing, and messaging capabilities. This guide covers the Hazelcast integration in our NestJS backend.

## Overview

Our Hazelcast integration provides:
- **Distributed Map Storage**: Store key-value pairs across multiple nodes
- **High Availability**: Automatic data replication and failover
- **Horizontal Scalability**: Add more nodes to increase capacity
- **Fast Performance**: In-memory storage with microsecond latency
- **TTL Support**: Automatic expiration of cached data

## Architecture

The Hazelcast implementation follows a modular architecture:

```
backend/src/cache/hazelcast/
├── hazelcast.module.ts       # NestJS module configuration
├── hazelcast.provider.ts     # Hazelcast client provider
├── hazelcast.service.ts      # Business logic and cache operations
└── hazelcast.controller.ts   # REST API endpoints
```

## Prerequisites

### 1. Install Dependencies

```bash
npm install hazelcast-client
# or
pnpm add hazelcast-client
```

### 2. Start Hazelcast Server

Using Docker Compose:

```bash
cd backend
docker compose up hazelcast -d
```

This will start Hazelcast on `localhost:5701`.

Or using docker hub
```bash
docker run -p 5701:5701 hazelcast/hazelcast
```

### 3. Verify Hazelcast is Running

```bash
docker ps | grep hazelcast
```

You should see the container running:
```
CONTAINER ID   IMAGE                      STATUS         PORTS
abc123def456   hazelcast/hazelcast:5.3.0  Up 2 minutes   0.0.0.0:5701->5701/tcp
```

## Configuration

### Provider Configuration

The Hazelcast client is configured in `hazelcast.provider.ts`:

```typescript
import { Client } from 'hazelcast-client';

export const HAZELCAST = 'HAZELCAST_CLIENT';

export const hazelcastProvider = {
  provide: HAZELCAST,
  useFactory: async () => {
    const client = await Client.newHazelcastClient({
      clusterName: 'dev',
      network: {
        clusterMembers: ['localhost:5701'],
      },
    });
    return client;
  },
};
```

**Configuration Options:**
- `clusterName`: Name of the Hazelcast cluster (default: `dev`)
- `clusterMembers`: Array of Hazelcast node addresses
- Additional options: connection timeout, retry settings, SSL/TLS configuration

### Module Registration

Import the `HazelcastModule` in your application module:

```typescript
import { Module } from '@nestjs/common';
import { HazelcastModule } from './cache/hazelcast/hazelcast.module';

@Module({
  imports: [HazelcastModule],
  // ...
})
export class AppModule {}
```

## API Reference

The Hazelcast service provides the following methods:

### Core Operations

#### `get<T>(mapName: string, key: string): Promise<T | null>`

Retrieve a value from the cache.

```typescript
const user = await hazelcastService.get('users', 'user:123');
```

#### `set(mapName: string, key: string, value: unknown, ttl?: number): Promise<boolean>`

Store a value in the cache with optional TTL (time-to-live) in milliseconds.

```typescript
// Without TTL
await hazelcastService.set('users', 'user:123', { name: 'John', age: 30 });

// With TTL (expires after 1 hour)
await hazelcastService.set('sessions', 'session:abc', sessionData, 3600000);
```

#### `delete(mapName: string, key: string): Promise<boolean>`

Remove a key from the cache.

```typescript
await hazelcastService.delete('users', 'user:123');
```

#### `containsKey(mapName: string, key: string): Promise<boolean>`

Check if a key exists in the cache.

```typescript
const exists = await hazelcastService.containsKey('users', 'user:123');
```

### Advanced Operations

#### `getAllEntries<T>(mapName: string): Promise<Array<[string, T]>>`

Get all key-value pairs from a map.

```typescript
const entries = await hazelcastService.getAllEntries('users');
// Returns: [['user:1', {...}], ['user:2', {...}]]
```

#### `getKeys(mapName: string): Promise<string[]>`

Get all keys from a map.

```typescript
const keys = await hazelcastService.getKeys('users');
// Returns: ['user:1', 'user:2', 'user:3']
```

#### `getValues<T>(mapName: string): Promise<T[]>`

Get all values from a map.

```typescript
const values = await hazelcastService.getValues('users');
```

#### `getSize(mapName: string): Promise<number>`

Get the number of entries in a map.

```typescript
const size = await hazelcastService.getSize('users');
```

#### `clear(mapName: string): Promise<boolean>`

Remove all entries from a map.

```typescript
await hazelcastService.clear('users');
```

#### `putIfAbsent(mapName: string, key: string, value: unknown, ttl?: number): Promise<unknown>`

Set a value only if the key doesn't already exist.

```typescript
const previousValue = await hazelcastService.putIfAbsent('users', 'user:123', userData);
// Returns null if key was set, or the existing value if key already existed
```

#### `getMultiple<T>(mapName: string, keys: string[]): Promise<Map<string, T>>`

Retrieve multiple values in a single operation.

```typescript
const values = await hazelcastService.getMultiple('users', ['user:1', 'user:2', 'user:3']);
```

## REST API Endpoints

The backend exposes the following HTTP endpoints for testing and integration:

### Set a Value

**Endpoint:** `POST /hazelcast/:mapName/:key`

**Request Body:**
```json
{
  "value": "your-data-here",
  "ttl": 60000
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/hazelcast/users/user:123 \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "John Doe", "age": 30}}'
```

**Response:**
```json
{
  "message": "Successfully set key 'user:123' in map 'users'",
  "ttl": "no expiration"
}
```

### Get a Value

**Endpoint:** `GET /hazelcast/:mapName/:key`

**Example:**
```bash
curl http://localhost:3000/hazelcast/users/user:123
```

**Response:**
```json
{
  "mapName": "users",
  "key": "user:123",
  "value": {
    "name": "John Doe",
    "age": 30
  }
}
```

### Delete a Key

**Endpoint:** `DELETE /hazelcast/:mapName/:key`

**Example:**
```bash
curl -X DELETE http://localhost:3000/hazelcast/users/user:123
```

**Response:**
```json
{
  "message": "Successfully deleted key 'user:123' from map 'users'"
}
```

### Check if Key Exists

**Endpoint:** `GET /hazelcast/:mapName/:key/exists`

**Example:**
```bash
curl http://localhost:3000/hazelcast/users/user:123/exists
```

**Response:**
```json
{
  "mapName": "users",
  "key": "user:123",
  "exists": true
}
```

### Get All Entries

**Endpoint:** `GET /hazelcast/:mapName/entries`

**Example:**
```bash
curl http://localhost:3000/hazelcast/users/entries
```

**Response:**
```json
{
  "mapName": "users",
  "count": 2,
  "entries": [
    {"key": "user:1", "value": {"name": "Alice"}},
    {"key": "user:2", "value": {"name": "Bob"}}
  ]
}
```

### Get All Keys

**Endpoint:** `GET /hazelcast/:mapName/keys`

**Example:**
```bash
curl http://localhost:3000/hazelcast/users/keys
```

**Response:**
```json
{
  "mapName": "users",
  "count": 2,
  "keys": ["user:1", "user:2"]
}
```

### Get All Values

**Endpoint:** `GET /hazelcast/:mapName/values`

**Example:**
```bash
curl http://localhost:3000/hazelcast/users/values
```

**Response:**
```json
{
  "mapName": "users",
  "count": 2,
  "values": [
    {"name": "Alice"},
    {"name": "Bob"}
  ]
}
```

### Get Map Size

**Endpoint:** `GET /hazelcast/:mapName/size`

**Example:**
```bash
curl http://localhost:3000/hazelcast/users/size
```

**Response:**
```json
{
  "mapName": "users",
  "size": 2
}
```

### Clear All Entries

**Endpoint:** `DELETE /hazelcast/:mapName/clear`

**Example:**
```bash
curl -X DELETE http://localhost:3000/hazelcast/users/clear
```

**Response:**
```json
{
  "message": "Successfully cleared map 'users'"
}
```

### Put If Absent

**Endpoint:** `POST /hazelcast/:mapName/:key/if-absent`

**Request Body:**
```json
{
  "value": "your-data-here",
  "ttl": 60000
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/hazelcast/users/user:123/if-absent \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "Jane Doe"}}'
```

**Response (key doesn't exist):**
```json
{
  "message": "Successfully set key 'user:123' in map 'users'",
  "previousValue": null
}
```

**Response (key already exists):**
```json
{
  "message": "Key 'user:123' already exists in map 'users'",
  "previousValue": {"name": "John Doe"}
}
```

### Get Multiple Values

**Endpoint:** `GET /hazelcast/:mapName/multiple?keys=key1,key2,key3`

**Example:**
```bash
curl "http://localhost:3000/hazelcast/users/multiple?keys=user:1,user:2,user:3"
```

**Response:**
```json
{
  "mapName": "users",
  "requested": 3,
  "found": 2,
  "values": {
    "user:1": {"name": "Alice"},
    "user:2": {"name": "Bob"}
  }
}
```

## Testing Guide

### Manual Testing with cURL

#### 1. Start Your Backend Server

```bash
cd backend
npm run start:dev
# or
pnpm run start:dev
```

#### 2. Test Basic Operations

**Set a user:**
```bash
curl -X POST http://localhost:3000/hazelcast/users/user:1 \
  -H "Content-Type: application/json" \
  -d '{"value": {"id": 1, "name": "Alice", "email": "alice@example.com"}}'
```

**Get the user:**
```bash
curl http://localhost:3000/hazelcast/users/user:1
```

**Check if user exists:**
```bash
curl http://localhost:3000/hazelcast/users/user:1/exists
```

**Delete the user:**
```bash
curl -X DELETE http://localhost:3000/hazelcast/users/user:1
```

#### 3. Test TTL (Time-to-Live)

**Set a value with 10-second TTL:**
```bash
curl -X POST http://localhost:3000/hazelcast/sessions/session:abc \
  -H "Content-Type: application/json" \
  -d '{"value": {"userId": 123, "token": "xyz"}, "ttl": 10000}'
```

**Immediately get the value:**
```bash
curl http://localhost:3000/hazelcast/sessions/session:abc
```

**Wait 11 seconds, then try to get it again:**
```bash
sleep 11
curl http://localhost:3000/hazelcast/sessions/session:abc
# Should return: {"mapName":"sessions","key":"session:abc","value":null}
```

#### 4. Test Batch Operations

**Add multiple users:**
```bash
curl -X POST http://localhost:3000/hazelcast/users/user:1 \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "Alice"}}'

curl -X POST http://localhost:3000/hazelcast/users/user:2 \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "Bob"}}'

curl -X POST http://localhost:3000/hazelcast/users/user:3 \
  -H "Content-Type: application/json" \
  -d '{"value": {"name": "Charlie"}}'
```

**Get all entries:**
```bash
curl http://localhost:3000/hazelcast/users/entries
```

**Get specific users:**
```bash
curl "http://localhost:3000/hazelcast/users/multiple?keys=user:1,user:2"
```

**Get map size:**
```bash
curl http://localhost:3000/hazelcast/users/size
```

**Clear all:**
```bash
curl -X DELETE http://localhost:3000/hazelcast/users/clear
```

#### 5. Test Put If Absent

**First attempt (should succeed):**
```bash
curl -X POST http://localhost:3000/hazelcast/config/app:theme/if-absent \
  -H "Content-Type: application/json" \
  -d '{"value": "dark"}'
# Response: "Successfully set key..."
```

**Second attempt (should fail):**
```bash
curl -X POST http://localhost:3000/hazelcast/config/app:theme/if-absent \
  -H "Content-Type: application/json" \
  -d '{"value": "light"}'
# Response: "Key 'app:theme' already exists..."
```

### Testing with Postman

1. **Import Collection**: Create a new Postman collection named "Hazelcast API"
2. **Set Base URL**: Create an environment variable `BASE_URL = http://localhost:3000`
3. **Add requests** for each endpoint listed above
4. **Create Test Scripts**: Add assertions to verify responses

Example test script for "Set Value" request:
```javascript
pm.test("Status code is 200", function () {
    pm.response.to.have.status(200);
});

pm.test("Response contains success message", function () {
    var jsonData = pm.response.json();
    pm.expect(jsonData.message).to.include("Successfully set key");
});
```

### Testing with httpie

If you prefer httpie over cURL:

```bash
# Set a value
http POST localhost:3000/hazelcast/users/user:1 value:='{"name":"Alice"}'

# Get a value
http GET localhost:3000/hazelcast/users/user:1

# Delete a value
http DELETE localhost:3000/hazelcast/users/user:1
```

## Performance Characteristics

### Latency

- **Set Operation**: 1-5 ms
- **Get Operation**: < 1 ms
- **Delete Operation**: 1-3 ms
- **Batch Operations**: 5-20 ms (depending on size)

### Throughput

- **Single Node**: ~50,000 ops/sec
- **3-Node Cluster**: ~150,000 ops/sec (scales linearly)

### Memory

Each map entry consumes:
- Key overhead: ~40 bytes
- Value: depends on data size
- Metadata: ~32 bytes

## Best Practices

### 1. Map Naming Convention

Use descriptive, namespaced map names:

```typescript
// Good
await hazelcastService.set('user:profiles', 'user:123', userData);
await hazelcastService.set('session:tokens', 'token:abc', sessionData);

// Avoid
await hazelcastService.set('data', '123', userData);
```

### 2. Use TTL for Temporary Data

Always set TTL for session data, tokens, and temporary caches:

```typescript
// Session expires in 1 hour
await hazelcastService.set('sessions', sessionId, sessionData, 3600000);

// Verification code expires in 5 minutes
await hazelcastService.set('verification', code, data, 300000);
```

### 3. Error Handling

Always wrap Hazelcast operations in try-catch blocks:

```typescript
try {
  const user = await hazelcastService.get('users', userId);
  if (!user) {
    // Handle cache miss
    const userFromDB = await fetchUserFromDatabase(userId);
    await hazelcastService.set('users', userId, userFromDB, 3600000);
    return userFromDB;
  }
  return user;
} catch (error) {
  logger.error('Hazelcast error:', error);
  // Fallback to database
  return await fetchUserFromDatabase(userId);
}
```

### 4. Use Batch Operations

When fetching multiple keys, use `getMultiple` instead of multiple `get` calls:

```typescript
// Good
const users = await hazelcastService.getMultiple('users', ['user:1', 'user:2', 'user:3']);

// Avoid
const user1 = await hazelcastService.get('users', 'user:1');
const user2 = await hazelcastService.get('users', 'user:2');
const user3 = await hazelcastService.get('users', 'user:3');
```

### 5. Periodic Cleanup

For maps without TTL, implement periodic cleanup:

```typescript
// Clear old entries once per day
@Cron('0 0 * * *')
async cleanupOldCaches() {
  await this.hazelcastService.clear('temp:data');
}
```

## Troubleshooting

### Connection Issues

**Problem:** Cannot connect to Hazelcast server

**Solutions:**
1. Verify Hazelcast container is running:
   ```bash
   docker ps | grep hazelcast
   ```
2. Check network connectivity:
   ```bash
   telnet localhost 5701
   ```
3. Review Hazelcast logs:
   ```bash
   docker logs hazelcast
   ```

### Memory Issues

**Problem:** Hazelcast running out of memory

**Solutions:**
1. Set appropriate TTL on entries
2. Increase container memory limit in `docker-compose.yml`:
   ```yaml
   hazelcast:
     image: hazelcast/hazelcast:5.3.0
     deploy:
       resources:
         limits:
           memory: 2G
   ```
3. Implement eviction policies in Hazelcast config

### Slow Performance

**Problem:** Cache operations are slow

**Solutions:**
1. Check network latency between app and Hazelcast
2. Use batch operations instead of sequential calls
3. Monitor Hazelcast cluster health
4. Consider adding more cluster nodes

## Comparison with Other Caching Solutions

| Feature | Hazelcast | Redis | Memcached |
|---------|-----------|-------|-----------|
| Data Structures | Maps, Lists, Sets, Queues | Strings, Hashes, Lists, Sets, Sorted Sets | Key-Value only |
| Persistence | Optional | Yes (RDB, AOF) | No |
| Clustering | Built-in | Redis Cluster | Not native |
| TTL Support | Yes | Yes | Yes |
| Distributed Computing | Yes | Limited | No |
| Language | Java | C | C |
| Client Protocol | Binary | RESP | Text/Binary |

## Migration from Redis/Memcached

If you're migrating from Redis or Memcached:

### From Redis:
```typescript
// Redis
await redis.set('user:123', JSON.stringify(user), 'EX', 3600);
const data = await redis.get('user:123');
const user = JSON.parse(data);

// Hazelcast (no JSON serialization needed)
await hazelcast.set('users', 'user:123', user, 3600000);
const user = await hazelcast.get('users', 'user:123');
```

### From Memcached:
```typescript
// Memcached
await memcached.set('user:123', user, 3600);
const user = await memcached.get('user:123');

// Hazelcast (TTL in milliseconds instead of seconds)
await hazelcast.set('users', 'user:123', user, 3600000);
const user = await hazelcast.get('users', 'user:123');
```

## Additional Resources

- [Hazelcast Official Documentation](https://docs.hazelcast.com/)
- [Hazelcast Node.js Client](https://github.com/hazelcast/hazelcast-nodejs-client)
- [Hazelcast Cloud](https://cloud.hazelcast.com/)
- [Best Practices Guide](https://docs.hazelcast.com/hazelcast/latest/performance)

## Next Steps

- [Learn about Redis Integration](./redis.md)
- [Learn about Memcached Integration](./memcached.md)
- [Performance Benchmarking](../performance-comparison.md)

# Phase 2: Scaling Demonstrations

## Overview
This demonstrates scaling concepts including:
- CPU-bound blocking issues
- Vertical scaling with Node.js cluster module
- Horizontal scaling with load balancing
- Stateful vs stateless design
- Event loop monitoring

## Setup

### 1. Build and Start Services
```bash
cd backend
docker-compose build
docker-compose up
```

This starts:
- Nginx load balancer on port 80
- 3x API Gateway replicas (scaled via docker-compose)
- User, Order, Payment services

## Demonstrations

### Demo 1: CPU-Bound Blocking Problem

**Problem**: CPU-intensive operations block the event loop, preventing other requests from being processed.

```bash
# Terminal 1: Start a CPU-bound operation (takes 3 seconds)
curl http://localhost/api/cpu-bound

# Terminal 2: Immediately try to access another endpoint
curl http://localhost/api/users
```

**Expected Result**: Without scaling, the `/users` request will be delayed until `/cpu-bound` completes. Check the event loop monitoring logs:

```bash
docker-compose logs api-gateway | grep "Event loop delay"
```

You should see warnings like `Event loop delay: 3002ms` during the CPU operation.

### Demo 2: Stateful Design Problem

**Problem**: In-memory state (like counters) is per-instance, causing inconsistent behavior across replicas.

```bash
# Check which instance handles each request
curl http://localhost/api/count
curl http://localhost/api/count
curl http://localhost/api/count
curl http://localhost/api/count
```

**Expected Result**: You'll see different counts and PIDs because nginx round-robins between 3 instances:
```json
{"count": 1, "pid": 123}
{"count": 1, "pid": 456}
{"count": 2, "pid": 123}
{"count": 1, "pid": 789}
```

**Solution**: Use external state storage (Redis, database) instead of in-memory state.

### Demo 3: Vertical Scaling with Cluster Module

**What**: Use all CPU cores by forking worker processes.

To run API Gateway with cluster mode:

```bash
# Option 1: Update docker-compose.yml command
command: node dist/apps/api-gateway/cluster.js

# Option 2: Run locally
cd backend
pnpm install
pnpm build api-gateway
node dist/apps/api-gateway/cluster.js
```

**Benefits**:
- Utilizes all CPU cores
- Automatic worker restart on crash
- Better CPU-bound task handling

**Check worker processes**:
```bash
# See multiple workers running
docker exec -it <container-id> ps aux
```

### Demo 4: Horizontal Scaling with Load Balancer

**What**: Multiple instances behind nginx load balancer.

```bash
# Scale to 5 instances
docker-compose up --scale api-gateway=5 -d

# Verify all instances are healthy
curl http://localhost/api/metrics
curl http://localhost/api/metrics
curl http://localhost/api/metrics
# Different PIDs show different instances handling requests
```

**Check nginx load balancing**:
```bash
# Make multiple requests and see distribution
for i in {1..10}; do
  curl -s http://localhost/api/metrics | jq '.pid'
done
```

### Demo 5: Load Testing

Install autocannon for load testing:
```bash
npm install -g autocannon
```

**Test without scaling** (single instance):
```bash
# Stop nginx and access api-gateway directly
docker-compose stop nginx
docker-compose up -d --scale api-gateway=1

# Load test
autocannon -c 50 -d 10 http://localhost:3000/api/users
```

**Test with scaling** (multiple instances + load balancer):
```bash
# Start nginx and scale gateway
docker-compose up -d --scale api-gateway=5

# Load test through nginx
autocannon -c 50 -d 10 http://localhost/api/users
```

**Compare metrics**:
- Requests per second (higher is better)
- Latency p99 (lower is better)
- Error rate (should be 0%)

### Demo 6: Circuit Breaker Under Load

Test the circuit breaker with load:

```bash
# Stop payment service to trigger failures
docker-compose stop payment-service

# Rapid requests will open the circuit
for i in {1..10}; do
  curl http://localhost/api/pay
  echo ""
done

# You'll see circuit open message after 3 failures

# Restart service
docker-compose start payment-service

# Circuit will auto-close after timeout
```

## Monitoring

### Check Event Loop Health
```bash
docker-compose logs -f api-gateway | grep "Event loop"
```

### Check Process Metrics
```bash
curl http://localhost/api/metrics | jq
```

Returns:
```json
{
  "pid": 123,
  "uptime": 45.6,
  "memory": {
    "rss": "50 MB",
    "heapTotal": "20 MB",
    "heapUsed": "15 MB"
  },
  "requestCount": 42
}
```

### Nginx Status
```bash
curl http://localhost/nginx-health
```

## Key Concepts

### Blocking vs Non-Blocking
- **Blocking**: `/cpu-bound` - Synchronous CPU work blocks event loop
- **Non-Blocking**: `/users` - Async I/O doesn't block

### Vertical Scaling
- **What**: Add more resources to single machine (more CPU cores)
- **How**: Node.js cluster module forks worker processes
- **When**: CPU-bound workloads, utilize multi-core systems
- **Limits**: Single machine hardware limits

### Horizontal Scaling
- **What**: Add more machines/instances
- **How**: Load balancer distributes requests across instances
- **When**: Need to scale beyond single machine capacity
- **Requirements**: Stateless design (no in-memory session state)

### Stateless vs Stateful
- **Stateless**: Each request is independent, no server-side state
- **Stateful**: Server maintains state (sessions, counters)
- **Problem**: Stateful apps don't scale horizontally without sticky sessions
- **Solution**: Store state externally (Redis, database, JWT tokens)

## Best Practices

1. **Design for Horizontal Scaling**
   - Keep services stateless
   - Use external state stores (Redis, databases)
   - Store sessions in Redis or JWT tokens

2. **Avoid Event Loop Blocking**
   - Move CPU-intensive work to worker threads
   - Use `worker_threads` module
   - Consider separate worker services

3. **Implement Health Checks**
   - Each service should have `/health` endpoint
   - Load balancer checks health before routing

4. **Monitor Event Loop**
   - Track event loop delay
   - Alert if delay > threshold (e.g., 50ms)
   - Indicates CPU saturation

5. **Use Circuit Breakers**
   - Prevent cascading failures
   - Fast fail when services are down
   - Auto-recovery when services return

6. **Load Testing**
   - Test under realistic load before production
   - Find breaking points
   - Optimize based on bottlenecks

## Troubleshooting

### High Event Loop Delay
- **Cause**: CPU-bound operations blocking event loop
- **Solution**: Use worker threads or separate service

### Inconsistent State Across Requests
- **Cause**: In-memory state with multiple instances
- **Solution**: Use Redis or database for shared state

### Uneven Load Distribution
- **Cause**: Long-lived connections or sticky sessions
- **Solution**: Configure nginx least_conn or ip_hash

### Container Not Scaling
```bash
# Verify docker-compose version supports scaling
docker-compose version

# Use v2 syntax
docker compose up --scale api-gateway=3
```

## Next Steps

- Implement Redis for distributed caching
- Add APM (Application Performance Monitoring)
- Implement distributed tracing
- Add metrics exporter (Prometheus)
- Implement graceful shutdown
- Add container resource limits

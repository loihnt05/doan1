# Phase 3: Load Balancer & Kubernetes Concepts

## 🎯 Phase 3 Goals

After completing this phase, you will understand:

-  What a Load Balancer does (and what it does NOT do)
-  Static vs Dynamic load balancing algorithms
-  Health checks (active vs passive)
-  Differences between: Load Balancer, Reverse Proxy, Forward Proxy, API Gateway
-  Client-side vs Server-side load balancing
-  Kubernetes networking concepts (ClusterIP, NodePort, LoadBalancer, Ingress)
-  Service discovery patterns
-  Service mesh concepts

---

## 1️⃣ Where Load Balancer Fits

```
┌─────────┐
│ Client  │
└────┬────┘
     │
     v
┌─────────────────┐
│ Load Balancer   │  ← Distributes traffic
└────┬────────────┘
     │
     v
┌─────────────────┐
│ API Gateway x3  │  ← Applies policies (auth, rate limit)
└────┬────────────┘
     │
     v
┌─────────────────┐
│ Services x N    │  ← Business logic
└─────────────────┘
```

### Key Concept:
> **Load Balancer distributes traffic, API Gateway applies policies.**

**Load Balancer**:
- Routes requests to healthy instances
- No business logic
- Works at Layer 4 (TCP) or Layer 7 (HTTP)

**API Gateway**:
- Authentication, authorization
- Rate limiting, caching
- Request transformation
- Business-aware routing

---

## 2️⃣ Load Balancing Algorithms

### 2.1 Round Robin (Static)

**How it works**: Each request goes to the next instance in order.

**Configuration**: `infra/nginx/nginx-round-robin.conf`

```nginx
upstream api_gateway {
    server api-gateway:3000;
    # Round-robin is default - no special directive needed
}
```

**Pros**:
-  Simple and fair
-  Works well for identical instances
-  Evenly distributes load

**Cons**:
-  Doesn't consider instance load
-  Doesn't consider request complexity
-  May overload slower instances

**Best for**: Homogeneous workloads with similar request patterns

---

### 2.2 Least Connections (Dynamic)

**How it works**: Routes to the instance with fewest active connections.

**Configuration**: `infra/nginx/nginx-least-conn.conf`

```nginx
upstream api_gateway {
    least_conn;
    server api-gateway:3000;
}
```

**Pros**:
-  Better for long-lived connections
-  Adapts to load dynamically
-  Prevents overloading busy instances

**Cons**:
-  Slightly more overhead
-  Requires connection tracking

**Best for**:
- WebSocket connections
- Server-Sent Events (SSE)
- File uploads/downloads
- Streaming APIs
- Variable request duration

---

### 2.3 IP Hash (Sticky Sessions)

**How it works**: Same client IP always goes to same instance.

**Configuration**: `infra/nginx/nginx-ip-hash.conf`

```nginx
upstream api_gateway {
    ip_hash;
    server api-gateway:3000;
}
```

**Pros**:
-  Session persistence without shared storage
-  Consistent routing per client

**Cons**:
-  Uneven load distribution
-  Doesn't work well with NAT/proxies
-  Session lost if instance fails
-  Not recommended for stateless architectures

**Best for**:
- Legacy apps with server-side sessions (temporary solution)

**Better alternatives**:
- Redis for shared sessions
- JWT tokens (stateless)
- Database-backed sessions

---

### 2.4 Weighted Round Robin

**How it works**: More capable instances get more traffic.

```nginx
upstream api_gateway {
    server api-gateway-1:3000 weight=3;  # 3x traffic
    server api-gateway-2:3000 weight=1;  # 1x traffic
}
```

**Best for**: Heterogeneous instance sizes (e.g., 2 large + 1 small)

---

### 2.5 Algorithm Comparison

| Algorithm | Type | Use Case | Pros | Cons |
|-----------|------|----------|------|------|
| Round Robin | Static | General purpose | Simple, fair | Ignores load |
| Least Conn | Dynamic | Long connections | Load-aware | More overhead |
| IP Hash | Static | Sticky sessions | Consistent | Uneven, fragile |
| Weighted | Static | Mixed sizes | Flexible | Manual tuning |

---

## 3️⃣ Health Checks

### 3.1 The Problem

**Without health checks**:
```
Client → LB → Dead Instance 
                ↓
            Timeout!
```

**With health checks**:
```
Client → LB → Healthy Instance 
              (dead instance bypassed)
```

---

### 3.2 Passive Health Checks (Open Source Nginx)

**How it works**: Monitors real traffic, marks instance down after failures.

**Configuration**: `infra/nginx/nginx-health-checks.conf`

```nginx
upstream api_gateway {
    server api-gateway:3000 max_fails=3 fail_timeout=30s;
    # After 3 consecutive failures, mark down for 30 seconds
}
```

**Pros**:
-  No extra requests
-  Works with any backend
-  Built into open source Nginx

**Cons**:
-  Reactive (waits for user traffic to fail)
-  Some user requests will fail before marking down

---

### 3.3 Active Health Checks (Nginx Plus / Cloud LBs)

**How it works**: Periodically sends health check requests.

**Conceptual example** (Nginx Plus):
```nginx
location / {
    proxy_pass http://api_gateway;
    health_check interval=5s fails=3 passes=2 uri=/health;
}
```

**Pros**:
-  Proactive detection
-  Prevents user traffic from hitting dead instances
-  Configurable check frequency

**Cons**:
-  Requires Nginx Plus (paid) or cloud load balancer
-  Additional load on backends

---

### 3.4 Application Health Endpoint

**Already implemented**: `GET /api/health`

**Current response**:
```json
{
  "status": "ok",
  "timestamp": "2026-01-01T12:00:00Z"
}
```

**Enhanced version should check**:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-01T12:00:00Z",
  "checks": {
    "database": "ok",
    "redis": "ok",  
    "memory": "ok",
    "disk": "ok"
  },
  "uptime": 3600
}
```

**Best practices**:
- Keep /health lightweight (< 100ms)
- Don't query database on every check
- Return 200 for healthy, 5xx for unhealthy
- Include dependency status
- Cache results if checks are expensive

---

### 3.5 Kubernetes Health Probes

**Three types of probes**:

```yaml
# 1. Liveness Probe - Is container alive?
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  failureThreshold: 3
  # Action: RESTART container

# 2. Readiness Probe - Ready for traffic?
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  failureThreshold: 3
  # Action: REMOVE from Service

# 3. Startup Probe - Has it started?
startupProbe:
  httpGet:
    path: /health
    port: 3000
  failureThreshold: 30
  # Action: RESTART if never succeeds
```

**Comparison**:

| Probe | Purpose | Failure Action | Use Case |
|-------|---------|----------------|----------|
| Liveness | Is alive? | Restart container | Deadlocks, hangs |
| Readiness | Ready? | Remove from LB | Slow startup, deps |
| Startup | Started? | Restart | Very slow apps |

**See**: `infra/k8s/05-deployment-with-probes.yaml`

---

## 4️⃣ Proxy Types (Critical Distinctions)

### 4.1 Reverse Proxy

```
Client → Reverse Proxy → Backend
         (Nginx)          (Hidden)
```

**Characteristics**:
- Server-side proxy
- Hides backend servers
- Client doesn't know real server IPs
- Single entry point

**Capabilities**:
- Load balancing
- SSL termination
- Caching
- Compression
- Security (hide internal structure)

**Examples**: Nginx, HAProxy, Envoy

**👉 This is what we use in this project**

---

### 4.2 Forward Proxy

```
Client → Forward Proxy → Internet
         (VPN, Squid)
```

**Characteristics**:
- Client-side proxy
- Hides client identity
- Client explicitly configures proxy
- Used to access blocked content

**Capabilities**:
- Content filtering
- Anonymity
- Cache internet resources
- Access control

**Examples**: Squid, Corporate proxy, VPN

** Not used in this project**

---

### 4.3 Load Balancer vs Reverse Proxy

| Feature | Load Balancer | Reverse Proxy |
|---------|--------------|---------------|
| **Primary Job** | Distribute traffic | Forward requests |
| **Layer** | 4 (TCP) or 7 (HTTP) | Usually 7 (HTTP) |
| **Additional Features** | Health checks | Caching, SSL, compression |
| **Business Logic** | No | Can have some |
| **Examples** | AWS ELB, Nginx | Nginx, Envoy |

**Key insight**:
> Nginx can be BOTH a reverse proxy AND a load balancer!

Our nginx config does both:
- **Load Balancing**: Distributes across 3 instances
- **Reverse Proxy**: Forwards HTTP requests

---

### 4.4 API Gateway

```
Client → API Gateway → Multiple Services
         (Business-aware routing)
```

**Characteristics**:
- Layer 7 (HTTP) only
- Business logic aware
- Service orchestration
- Request/response transformation

**Capabilities**:
- Authentication & Authorization
- Rate limiting
- Request aggregation
- Protocol translation
- API versioning
- Monitoring & analytics

**Examples**: Kong, AWS API Gateway, our NestJS gateway

**Comparison**:

| Feature | Load Balancer | API Gateway |
|---------|--------------|-------------|
| Routing | Based on load | Based on business rules |
| Auth | No | Yes |
| Rate Limit | Basic | Advanced |
| Aggregation | No | Yes |
| Transformation | No | Yes |

---

### 4.5 The Full Stack

**Best practice architecture**:
```
Internet
   ↓
Load Balancer (Layer 4)
   ↓  
Reverse Proxy (Layer 7)
   ↓
API Gateway (Business)
   ↓
Services
```

**In production (AWS example)**:
```
Internet
   ↓
AWS ELB (Load Balancer)
   ↓
Nginx (Reverse Proxy + SSL)
   ↓
API Gateway (Auth, rate limit)
   ↓
Microservices
```

**In our Docker setup**:
```
Client
   ↓
Nginx (LB + Reverse Proxy)
   ↓
API Gateway (Business logic)
   ↓
Services
```

---

## 5️⃣ Client-Side vs Server-Side Load Balancing

### 5.1 Server-Side LB (Traditional)

```
┌────────┐
│ Client │
└───┬────┘
    │
    ↓
┌───────────┐
│ Nginx LB  │ ← Centralized decision
└───┬───────┘
    │
    ├─→ Instance 1
    ├─→ Instance 2
    └─→ Instance 3
```

**Pros**:
-  Simple clients (don't need LB logic)
-  Centralized control
-  Easy to monitor
-  Works with any client

**Cons**:
-  Extra hop (latency)
-  Single point of failure
-  LB can become bottleneck

**Used by**: Most web applications, our project

---

### 5.2 Client-Side LB

```
┌────────────────┐
│ Client with LB │ ← Client chooses instance
└───┬────────────┘
    │
    ├─→ Instance 1
    ├─→ Instance 2
    └─→ Instance 3
```

**How it works**:
1. Client queries service registry
2. Gets list of healthy instances
3. Client chooses instance (round-robin, etc.)
4. Connects directly

**Pros**:
-  No extra hop (lower latency)
-  No LB bottleneck
-  Better for service mesh

**Cons**:
-  Complex clients (LB logic in each)
-  Harder to monitor
-  Inconsistent LB across clients

**Used by**:
- Netflix Ribbon
- gRPC
- Service meshes (Istio, Linkerd)

---

### 5.3 Comparison

| Aspect | Server-Side | Client-Side |
|--------|-------------|-------------|
| **Latency** | +1 hop | Direct |
| **Simplicity** | Simple clients | Complex clients |
| **Bottleneck** | LB can be | Distributed |
| **Monitoring** | Centralized | Distributed |
| **Best for** | Public APIs | Internal microservices |

---

## 6️⃣ Service Discovery

### 6.1 Without Service Discovery (Static)

```typescript
// Hardcoded service URLs 
const USER_SERVICE = 'http://user-service:3001';
const ORDER_SERVICE = 'http://order-service:3002';
```

**Problems**:
-  Fragile (what if port changes?)
-  Manual updates needed
-  No automatic failover
-  Doesn't scale

---

### 6.2 With Service Registry (Dynamic)

```
┌─────────┐
│ Service │ ──① Register──→ ┌──────────┐
└─────────┘                  │ Registry │
                             │(Consul)  │
┌────────┐                   └──────────┘
│ Client │ ──② Query────→        ↑
└────┬───┘                        │
     │                            │
     └──③ Connect to IP───────────┘
```

**Steps**:
1. Service registers itself with registry
2. Client queries registry for available instances
3. Client connects to instance
4. Registry monitors health, removes dead instances

**Benefits**:
-  Dynamic instance discovery
-  Automatic failover
-  Scales automatically
-  Health monitoring built-in

**Examples**:
- **Consul**: HashiCorp's service mesh
- **Eureka**: Netflix OSS
- **etcd**: CoreOS distributed config
- **Kubernetes DNS**: Built-in K8s service discovery

---

### 6.3 Kubernetes Service Discovery

In Kubernetes, **service discovery is automatic**:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: user-service
spec:
  selector:
    app: user
  ports:
    - port: 80
      targetPort: 3001
```

**How it works**:
1. Service creates stable DNS name: `user-service.default.svc.cluster.local`
2. kube-proxy creates iptables rules
3. Pods can use service name directly:
   ```typescript
   http://user-service/users  // Just works!
   ```

**Benefits**:
-  Zero configuration
-  Automatic load balancing
-  Health checks integrated
-  No external registry needed

---

## 7️⃣ Kubernetes Networking

### 7.1 Service Types

**See detailed YAML examples in**: `infra/k8s/`

#### ClusterIP (Default - Internal Only)

```yaml
type: ClusterIP
```

- Accessible only within cluster
- Gets virtual IP (e.g., 10.96.0.100)
- DNS: `service-name.namespace.svc.cluster.local`
- **Best for**: Internal microservices

**File**: `01-service-clusterip.yaml`

---

#### NodePort (Development)

```yaml
type: NodePort
```

- Exposed on each node's IP at static port (30000-32767)
- Accessible from outside cluster
- **Best for**: Testing, development

**File**: `02-service-nodeport.yaml`

**Access**: `http://<any-node-ip>:30080`

---

#### LoadBalancer (Production - Cloud)

```yaml
type: LoadBalancer
```

- Provisions cloud load balancer (AWS ELB, GCP LB)
- Gets public IP
- **Best for**: Production external access

**File**: `03-service-loadbalancer.yaml`

**Access**: `http://<cloud-lb-dns>`

---

#### Ingress (Layer 7 Routing)

```yaml
kind: Ingress
```

- HTTP(S) routing based on host/path
- SSL termination
- Single entry point for multiple services
- **Best for**: Multiple HTTP services

**File**: `04-ingress.yaml`

**Example routing**:
```
api.example.com/users   → user-service
api.example.com/orders  → order-service
admin.example.com       → admin-service
```

---

### 7.2 Service Type Comparison

| Type | External Access | Use Case | Cost |
|------|----------------|----------|------|
| **ClusterIP** |  No | Internal only | Free |
| **NodePort** |  Yes | Development | Free |
| **LoadBalancer** |  Yes | Production | $$ per LB |
| **Ingress** |  Yes | Multiple services | $ (shared LB) |

**Best Practice**:
- Internal services: ClusterIP
- External API: Ingress (cost-effective for multiple services)
- Special cases: LoadBalancer

---

### 7.3 How kube-proxy Works

**kube-proxy** runs on every node and:

1. **Watches** Services and Endpoints
2. **Creates** iptables/IPVS rules
3. **Translates** Service IP → Pod IPs

**Example**:
```
Client requests: http://user-service:80
                        ↓
           kube-proxy intercepts
                        ↓
           Translates to pod IP:
                  10.244.1.5:3001
```

**Modes**:
- **iptables**: Default, uses Linux iptables (good for < 1000 services)
- **IPVS**: Better performance for large clusters

---

## 8️⃣ Service Mesh (Advanced Concept)

### 8.1 What is a Service Mesh?

**Without Service Mesh**:
```
Service A → Service B
```

**With Service Mesh**:
```
Service A → Sidecar Proxy → Sidecar Proxy → Service B
            (Envoy)          (Envoy)
```

**Key idea**:
> Every pod gets a sidecar proxy that handles ALL network communication.

---

### 8.2 What It Handles

**Service mesh takes care of**:
-  mTLS (mutual TLS) - automatic encryption
-  Traffic routing (canary, blue-green)
-  Load balancing (client-side)
-  Retries and timeouts
-  Circuit breaking
-  Observability (tracing, metrics)
-  Authentication & authorization

**Without writing ANY code in your service!**

---

### 8.3 Architecture

```
┌──────────────────────────────────┐
│  Service Mesh Control Plane      │
│  (Istio, Linkerd)               │
└────────────┬────────────────────┘
             │ Configuration
             ↓
┌──────────────────────────────────┐
│ Pod                              │
│ ┌─────────┐  ┌────────────────┐ │
│ │ Service │←→│ Envoy Sidecar  │ │
│ └─────────┘  └────────┬───────┘ │
└──────────────────────│──────────┘
                       │
                       ↓ mTLS
┌──────────────────────│──────────┐
│ Pod                  ↓          │
│ ┌────────────────┐  ┌─────────┐ │
│ │ Envoy Sidecar  │←→│ Service │ │
│ └────────────────┘  └─────────┘ │
└──────────────────────────────────┘
```

---

### 8.4 Tools

#### Istio
- Most feature-rich
- Complex to set up
- Envoy-based

#### Linkerd
- Lightweight
- Easier to use
- Better performance

#### Consul Connect
- HashiCorp's solution
- Multi-cloud

---

### 8.5 When to Use Service Mesh

** Use when**:
- Many microservices (> 10)
- Need mTLS everywhere
- Complex routing requirements
- High security requirements
- Want observability without code changes

** Don't use when**:
- Simple architecture (< 5 services)
- Adding complexity isn't worth it
- Team lacks expertise
- Performance overhead is concern

---

### 8.6 Service Mesh vs API Gateway

| Feature | Service Mesh | API Gateway |
|---------|-------------|-------------|
| **Scope** | All service-to-service | Client to services |
| **Location** | Inside cluster | Edge of cluster |
| **Purpose** | Infrastructure | Business logic |
| **Examples** | Istio, Linkerd | Kong, our gateway |

**Best practice**: Use BOTH
```
Client → API Gateway → Service Mesh → Services
         (Auth)         (mTLS, retry)
```

---

## 9️⃣ Testing Load Balancing Algorithms

### Test Round Robin

```bash
# Start with round-robin config
docker-compose down
cp infra/nginx/nginx-round-robin.conf nginx.conf
docker-compose up -d --scale api-gateway=3

# Make requests and see distribution
for i in {1..12}; do
  curl -s http://localhost/api/count
done

# Should see: 1,1,1,2,2,2,3,3,3,4,4,4 (perfect distribution)
```

### Test Least Connections

```bash
# Switch to least-conn
docker-compose down
cp infra/nginx/nginx-least-conn.conf nginx.conf
docker-compose up -d --scale api-gateway=3

# Start long request in background
curl http://localhost/api/cpu-bound &

# Immediate requests should go to OTHER instances
for i in {1..5}; do
  curl -s http://localhost/api/count
done
```

### Test IP Hash

```bash
# Switch to ip-hash
docker-compose down
cp infra/nginx/nginx-ip-hash.conf nginx.conf
docker-compose up -d --scale api-gateway=3

# All requests from same IP go to same instance
for i in {1..10}; do
  curl -s http://localhost/api/count
done

# Should see: 1,2,3,4,5,6,7,8,9,10 (same instance every time)
```

---

## 🔟 Phase 3 Checkpoint

### What We've Covered

 **Load Balancing Algorithms**
- Round Robin (static)
- Least Connections (dynamic)
- IP Hash (sticky sessions)
- Weighted distribution

 **Health Checks**
- Passive (Nginx open source)
- Active (conceptual)
- Kubernetes probes (liveness, readiness, startup)

 **Proxy Types**
- Reverse Proxy (our Nginx)
- Forward Proxy (not used)
- Load Balancer vs Reverse Proxy
- API Gateway (business-aware)

 **Load Balancing Patterns**
- Server-side (traditional, our setup)
- Client-side (service mesh)

 **Service Discovery**
- Static (hardcoded)
- Dynamic (registry-based)
- Kubernetes DNS (automatic)

 **Kubernetes Networking**
- ClusterIP (internal)
- NodePort (development)
- LoadBalancer (production)
- Ingress (Layer 7 routing)
- kube-proxy (how it works)

 **Service Mesh**
- Sidecar pattern
- mTLS, retries, circuit breaking
- Istio, Linkerd
- When to use

---

## 📁 Files Created

### Nginx Configurations
- `infra/nginx/nginx-round-robin.conf` - Default algorithm
- `infra/nginx/nginx-least-conn.conf` - Dynamic load balancing
- `infra/nginx/nginx-ip-hash.conf` - Sticky sessions
- `infra/nginx/nginx-health-checks.conf` - Advanced health checks

### Kubernetes Manifests
- `infra/k8s/01-service-clusterip.yaml` - Internal service
- `infra/k8s/02-service-nodeport.yaml` - Development access
- `infra/k8s/03-service-loadbalancer.yaml` - Production access
- `infra/k8s/04-ingress.yaml` - Layer 7 routing
- `infra/k8s/05-deployment-with-probes.yaml` - Health probes

---

## 🎓 Key Takeaways

1. **Load Balancer ≠ Reverse Proxy ≠ API Gateway**
   - Each has different responsibilities
   - Can be combined (Nginx does LB + reverse proxy)

2. **Choose Algorithm Based on Workload**
   - Round Robin: General purpose
   - Least Connections: Long-lived connections
   - IP Hash: ONLY when absolutely necessary (prefer stateless)

3. **Health Checks are Critical**
   - Always implement /health endpoint
   - Use readiness probes in Kubernetes
   - Monitor health check failures

4. **Kubernetes Services Abstract Load Balancing**
   - ClusterIP for internal
   - Ingress for external (cost-effective)
   - kube-proxy handles the magic

5. **Service Mesh for Advanced Scenarios**
   - Use when needed (many services, security)
   - Don't use for simple architectures
   - Complements API Gateway

---

## 🚀 Next Steps

### Phase 4: Distributed Caching & State
- Redis integration
- Cache strategies
- Session management
- Distributed locks

### Phase 5: Observability
- Prometheus metrics
- Grafana dashboards
- Distributed tracing (Jaeger)
- Centralized logging (ELK)

---

## 📚 Resources

- [Nginx Load Balancing](https://nginx.org/en/docs/http/load_balancing.html)
- [Kubernetes Services](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Istio Documentation](https://istio.io/latest/docs/)
- [Envoy Proxy](https://www.envoyproxy.io/)
- [Martin Fowler - Service Mesh](https://martinfowler.com/articles/service-mesh.html)

---

**Phase 3 Complete!** 🎉

You now understand load balancing, proxies, and Kubernetes networking at both conceptual and practical levels.

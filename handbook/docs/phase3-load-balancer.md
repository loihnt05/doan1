---
sidebar_position: 2
---

# Load Balancer & Kubernetes Networking

## Overview

Phase 3 explores load balancing strategies, proxy types, and Kubernetes networking concepts through practical examples and detailed explanations.

## 🎯 Learning Objectives

By the end of this phase, you'll understand:

- Load balancing algorithms and when to use each
- Critical differences between Load Balancer, Reverse Proxy, Forward Proxy, and API Gateway
- Health check strategies (passive vs active)
- Kubernetes Service types and networking
- Service discovery patterns
- Service mesh concepts

---

## Load Balancing Algorithms

### Round Robin (Default)

**Concept**: Distribute requests sequentially to each instance.

```
Request 1 → Instance A
Request 2 → Instance B  
Request 3 → Instance C
Request 4 → Instance A (cycle repeats)
```

**Configuration**:
```nginx
upstream api_gateway {
    server api-gateway:3000;
    # Round-robin is default
}
```

**Pros**: ✅ Simple, fair distribution  
**Cons**: ❌ Ignores instance load  
**Best for**: Homogeneous workloads

---

### Least Connections

**Concept**: Route to instance with fewest active connections.

```
Instance A: 5 connections → Don't send here
Instance B: 2 connections → Send here! ✓
Instance C: 3 connections
```

**Configuration**:
```nginx
upstream api_gateway {
    least_conn;
    server api-gateway:3000;
}
```

**Pros**: ✅ Load-aware, adapts dynamically  
**Cons**: ❌ Slight overhead  
**Best for**: Long-lived connections (WebSocket, SSE, uploads)

---

### IP Hash (Sticky Sessions)

**Concept**: Same client IP always routes to same instance.

```
Client 203.0.113.1 → Always Instance B
Client 203.0.113.2 → Always Instance A
```

**Configuration**:
```nginx
upstream api_gateway {
    ip_hash;
    server api-gateway:3000;
}
```

**Pros**: ✅ Session persistence  
**Cons**: ❌ Uneven load, doesn't work with NAT  
**Best for**: Legacy apps (temporary solution)

**⚠️ Warning**: Prefer stateless design with Redis/JWT instead!

---

## Proxy Types Explained

### Architecture Comparison

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  CLIENT                                              │
│                                                      │
└────┬─────────────────────────────────────────────────┘
     │
     │ Reverse Proxy
     ├──────────────────────┐
     │                      │
     v                      v
┌─────────────┐      ┌─────────────┐
│  Backend A  │      │  Backend B  │
└─────────────┘      └─────────────┘
```

vs

```
┌──────────────────────────────────────────────────────┐
│                                                      │
│  CLIENT                                              │
│                                                      │
└────┬─────────────────────────────────────────────────┘
     │
     │ Forward Proxy
     v
┌──────────────┐
│ Internet     │
└──────────────┘
```

---

### Reverse Proxy

**Direction**: Client → Proxy → Backend

**Purpose**: Hide and protect backend servers

**Features**:
- Load balancing
- SSL termination
- Caching
- Compression

**Example**: Nginx, HAProxy, Envoy

**Used in**: This project ✓

---

### Forward Proxy

**Direction**: Client → Proxy → Internet

**Purpose**: Hide and protect client identity

**Features**:
- Content filtering
- Anonymity
- Access control

**Example**: VPN, Squid, Corporate proxy

**Used in**: This project ✗

---

### Load Balancer vs Reverse Proxy

| Feature | Load Balancer | Reverse Proxy |
|---------|--------------|---------------|
| **Primary Purpose** | Distribute traffic | Forward requests |
| **OSI Layer** | Layer 4 or 7 | Layer 7 |
| **Health Checks** | Yes | Optional |
| **SSL Termination** | Sometimes | Yes |
| **Caching** | No | Yes |

**Key Insight**: Nginx can be BOTH!

---

### API Gateway

**Direction**: Client → Gateway → Multiple Services

**Purpose**: Business-aware routing and policies

**Features**:
- Authentication & Authorization
- Rate limiting
- Request aggregation
- Protocol translation
- API versioning

**Example**: Kong, AWS API Gateway, Our NestJS app

**Layer**: Application (Layer 7)

---

### The Complete Stack

**Best Practice Architecture**:

```
         Internet
            ↓
    Load Balancer (AWS ELB)
            ↓
    Reverse Proxy (Nginx)
            ↓
     API Gateway (NestJS)
            ↓
      ┌─────┴─────┬─────┐
      ↓           ↓     ↓
   User-SVC   Order  Payment
```

**Our Docker Setup**:

```
         Client
            ↓
  Nginx (LB + Reverse Proxy)
            ↓
   API Gateway (NestJS)
            ↓
      ┌─────┴─────┬─────┐
      ↓           ↓     ↓
   User-SVC   Order  Payment
```

---

## Health Checks

### The Problem

Without health checks:
```
Client → LB → Dead Instance ❌
           → Timeout!
           → Bad user experience
```

With health checks:
```
Client → LB → Healthy Instance ✓
       (bypasses dead instance)
```

---

### Passive Health Checks

**How it works**: Monitor real traffic, mark instance down after failures

**Configuration**:
```nginx
upstream api_gateway {
    server api-gateway:3000 max_fails=3 fail_timeout=30s;
}
```

**Behavior**:
1. Request fails
2. Count failure
3. After 3 failures → mark down for 30s
4. After 30s → retry

**Pros**: ✅ No extra requests  
**Cons**: ❌ Reactive (some users see failures)

---

### Active Health Checks

**How it works**: Periodically send health requests

**Conceptual Example** (Nginx Plus):
```nginx
health_check interval=5s fails=3 passes=2 uri=/health;
```

**Behavior**:
1. Every 5s, send GET /health
2. If 3 checks fail → mark down
3. If 2 checks succeed → mark up

**Pros**: ✅ Proactive detection  
**Cons**: ❌ Requires Nginx Plus or cloud LB

---

### Kubernetes Health Probes

Three types of probes:

#### Liveness Probe
**Question**: Is container alive?  
**Failure**: Restart container  
**Use case**: Detect deadlocks

```yaml
livenessProbe:
  httpGet:
    path: /health
    port: 3000
  failureThreshold: 3
```

#### Readiness Probe
**Question**: Ready for traffic?  
**Failure**: Remove from Service  
**Use case**: Slow startup, dependencies

```yaml
readinessProbe:
  httpGet:
    path: /health
    port: 3000
  failureThreshold: 3
```

#### Startup Probe
**Question**: Has it started?  
**Failure**: Restart  
**Use case**: Very slow apps

```yaml
startupProbe:
  httpGet:
    path: /health
    port: 3000
  failureThreshold: 30  # 150s timeout
```

---

## Kubernetes Services

### ClusterIP (Internal Only)

**Purpose**: Internal service-to-service communication

```yaml
apiVersion: v1
kind: Service
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: 3001
```

**Access**: `http://user-service` (inside cluster only)

**DNS**: `user-service.default.svc.cluster.local`

**Use case**: All internal microservices

---

### NodePort (Development)

**Purpose**: External access without cloud LB

```yaml
spec:
  type: NodePort
  ports:
    - port: 80
      targetPort: 3000
      nodePort: 30080
```

**Access**: `http://<node-ip>:30080`

**Use case**: Testing, development

**Warning**: Not recommended for production

---

### LoadBalancer (Production)

**Purpose**: Cloud-native external access

```yaml
spec:
  type: LoadBalancer
  ports:
    - port: 80
      targetPort: 3000
```

**Access**: `http://<cloud-lb-dns>` (auto-provisioned)

**Use case**: Production single service

**Providers**: AWS ELB, GCP LB, Azure LB

---

### Ingress (Layer 7 Routing)

**Purpose**: Single entry for multiple services

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
spec:
  rules:
    - host: api.example.com
      http:
        paths:
          - path: /users
            backend:
              service:
                name: user-service
          - path: /orders
            backend:
              service:
                name: order-service
```

**Access**:
- `http://api.example.com/users` → user-service
- `http://api.example.com/orders` → order-service

**Use case**: Production with multiple services (cost-effective)

---

### Service Comparison

| Type | External | Layer | Cost | Best For |
|------|----------|-------|------|----------|
| ClusterIP | ❌ | - | Free | Internal |
| NodePort | ✅ | 4 | Free | Dev/Test |
| LoadBalancer | ✅ | 4 | $$ | Single service |
| Ingress | ✅ | 7 | $ | Multiple services |

**Best Practice**:
- Internal: ClusterIP
- External: Ingress (shared LB)

---

## Service Discovery

### Without Registry (Static)

```typescript
// Hardcoded URLs ❌
const USER_SERVICE = 'http://192.168.1.10:3001';
```

**Problems**: Fragile, manual updates, no failover

---

### With Registry (Dynamic)

```
Service → Register → Registry (Consul)
                         ↓
Client  → Query    → Get healthy instances
        → Connect  → Direct to instance
```

**Benefits**: Dynamic, automatic failover, scales

**Examples**: Consul, Eureka, Kubernetes DNS

---

### Kubernetes Built-in Discovery

```yaml
apiVersion: v1
kind: Service
metadata:
  name: user-service
```

**Auto-creates DNS**: `user-service.default.svc.cluster.local`

**Usage**:
```typescript
// Just works! ✓
http://user-service/users
```

**kube-proxy** handles:
- Service → Pod IP translation
- Load balancing
- Health checks

---

## Service Mesh (Advanced)

### Architecture

```
┌─────────────────────────┐
│ Control Plane (Istio)   │
└──────────┬──────────────┘
           │ Config
           ↓
┌──────────────────────────┐
│ Service A                │
│ ┌──────┐  ┌───────────┐ │
│ │ App  │←→│ Envoy     │─┼─→ mTLS
│ └──────┘  │ Sidecar   │ │
└───────────┴───────────┴─┘
```

### What It Provides

✅ Automatic mTLS encryption  
✅ Retries and circuit breaking  
✅ Traffic routing (canary, blue-green)  
✅ Observability (tracing, metrics)  
✅ Load balancing (client-side)

**Without writing code!**

### When to Use

**✅ Use when:**
- Many microservices (> 10)
- Need mTLS everywhere
- Complex routing
- High security requirements

**❌ Don't use when:**
- Simple architecture (< 5 services)
- Team lacks expertise
- Performance overhead is concern

### Tools

- **Istio**: Feature-rich, complex
- **Linkerd**: Lightweight, simpler
- **Consul Connect**: Multi-cloud

---

## Testing

### Test Round Robin

```bash
cd backend
./test-load-balancing.sh
```

**Expected**: Even distribution across 3 instances

### Test Least Connections

```bash
# Start CPU-bound work
curl http://localhost/api/cpu-bound &

# New requests go to other instances
curl http://localhost/api/users
```

**Expected**: Fast response (routed to free instance)

### Test IP Hash

```bash
# Make multiple requests
for i in {1..10}; do curl http://localhost/api/count; done
```

**Expected**: All hit same instance (same count incrementing)

---

## Key Takeaways

1. **Load Balancer ≠ API Gateway**
   - LB distributes, Gateway applies business logic
   - Use both together

2. **Choose Algorithm by Workload**
   - Round Robin: Default, works for most
   - Least Conn: Long-lived connections
   - IP Hash: Only when absolutely necessary

3. **Health Checks are Critical**
   - Always implement /health endpoint
   - Use Kubernetes probes in production
   - Monitor probe failures

4. **Kubernetes Abstracts Complexity**
   - Services provide stable endpoints
   - kube-proxy handles load balancing
   - Ingress for cost-effective external access

5. **Service Mesh for Scale**
   - Use when benefits outweigh complexity
   - Complements (doesn't replace) API Gateway

---

## Files Reference

### Nginx Configurations
- `infra/nginx/nginx-round-robin.conf`
- `infra/nginx/nginx-least-conn.conf`
- `infra/nginx/nginx-ip-hash.conf`
- `infra/nginx/nginx-health-checks.conf`

### Kubernetes Examples
- `infra/k8s/01-service-clusterip.yaml`
- `infra/k8s/02-service-nodeport.yaml`
- `infra/k8s/03-service-loadbalancer.yaml`
- `infra/k8s/04-ingress.yaml`
- `infra/k8s/05-deployment-with-probes.yaml`

### Tests
- `test-load-balancing.sh` - Automated demonstrations

---

## Resources

- [Nginx Load Balancing Guide](https://nginx.org/en/docs/http/load_balancing.html)
- [Kubernetes Services Concepts](https://kubernetes.io/docs/concepts/services-networking/service/)
- [Istio Documentation](https://istio.io/latest/docs/)
- [CNCF Service Mesh Landscape](https://landscape.cncf.io/card-mode?category=service-mesh)

---

**Phase 3 Complete!** You now understand load balancing strategies and Kubernetes networking concepts through both theory and practice.

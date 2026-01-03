---
sidebar_position: 3
---
## Client-Side vs Server-Side Load Balancing

### Server-Side (Truyền thống)

```mermaid
flowchart TD
    Client[Client]
    LB[Load Balancer]

    S1[Server 1]
    S2[Server 2]
    S3[Server 3]
    S4[Server 4]

    Client --> LB
    LB --> S1
    LB --> S2
    LB --> S3
    LB --> S4

```

### Client-Side (Service Mesh)

```mermaid
flowchart TD
    Client[Client Sidecar ClientSideLB]

    S1[Server 1]
    S2[Server 2]
    S3[Server 3]

    Client --> S1
    Client --> S2
    Client --> S3


```

**Ví dụ Client-Side:**
```typescript
@Injectable()
export class ClientSideLoadBalancer {
  private services: string[] = [];
  private currentIndex = 0;

  constructor(private serviceRegistry: ServiceRegistry) {
    // Discover services
    this.discoverServices();
  }

  private async discoverServices() {
    // Get list from service registry (Consul, Eureka, etc.)
    this.services = await this.serviceRegistry.getServices('user-service');
  }

  async call(endpoint: string): Promise<any> {
    // Round-robin selection
    const service = this.services[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.services.length;

    try {
      return await fetch(`${service}${endpoint}`);
    } catch (error) {
      // Remove failed service and retry
      this.services.splice(this.currentIndex, 1);
      return this.call(endpoint);
    }
  }
}
```
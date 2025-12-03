---
sidebar_position: 4
---
# Graph Model (Neo4j)

The graph model represents data as nodes (entities) and relationships (connections). It excels at managing highly connected data and complex relationship queries.

## When to Use

- Data is highly interconnected
- Relationship queries are common
- Need to traverse connections
- Social networks, recommendation systems
- Fraud detection, network analysis
- Knowledge graphs

## Example: Social Network

### Data Model

**Nodes:** User
- Properties: id, name, email, age, createdAt

**Relationships:** FRIEND
- Properties: since, createdAt
- Type: Bidirectional

### Schema Visualization

```
(User)-[:FRIEND]->(User)
```

## Key Concepts

### 1. Creating Nodes

```typescript
async createUser(createUserDto: CreateUserDto): Promise<any> {
  const session = this.driver.session();
  try {
    const result = await session.run(
      `CREATE (u:User {
        id: randomUUID(),
        name: $name,
        email: $email,
        age: $age,
        createdAt: datetime()
      })
      RETURN u`,
      {
        name: createUserDto.name,
        email: createUserDto.email,
        age: createUserDto.age || null,
      },
    );
    
    return result.records[0].get('u').properties;
  } finally {
    await session.close();
  }
}
```

### 2. Creating Relationships

```typescript
async createFriendship(dto: CreateFriendshipDto): Promise<any> {
  const session = this.driver.session();
  try {
    const result = await session.run(
      `MATCH (u1:User {id: $userId1})
       MATCH (u2:User {id: $userId2})
       CREATE (u1)-[f:FRIEND {
         since: $since,
         createdAt: datetime()
       }]->(u2)
       CREATE (u2)-[f2:FRIEND {
         since: $since,
         createdAt: datetime()
       }]->(u1)
       RETURN u1, f, u2`,
      {
        userId1: dto.userId1,
        userId2: dto.userId2,
        since: dto.since || new Date().toISOString(),
      },
    );
    
    return {
      user1: result.records[0].get('u1').properties,
      user2: result.records[0].get('u2').properties,
      friendship: result.records[0].get('f').properties,
    };
  } finally {
    await session.close();
  }
}
```

### 3. Cypher Queries

**Get friends of a user:**

```cypher
MATCH (u:User {id: $userId})-[f:FRIEND]->(friend:User)
RETURN friend, f
ORDER BY friend.name
```

```typescript
async getFriendsOfUser(userId: string): Promise<any[]> {
  const session = this.driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User {id: $userId})-[f:FRIEND]->(friend:User)
       RETURN friend, f
       ORDER BY friend.name`,
      { userId },
    );
    
    return result.records.map(record => ({
      user: record.get('friend').properties,
      friendship: record.get('f').properties,
    }));
  } finally {
    await session.close();
  }
}
```

### 4. Graph Traversal - Friends of Friends

Find 2nd degree connections:

```cypher
MATCH (u:User {id: $userId})-[:FRIEND]->()-[:FRIEND]->(fof:User)
WHERE fof.id <> $userId
AND NOT (u)-[:FRIEND]->(fof)
RETURN DISTINCT fof
ORDER BY fof.name
```

```typescript
async getFriendsOfFriends(userId: string): Promise<any[]> {
  const session = this.driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User {id: $userId})-[:FRIEND]->()-[:FRIEND]->(fof:User)
       WHERE fof.id <> $userId
       AND NOT (u)-[:FRIEND]->(fof)
       RETURN DISTINCT fof
       ORDER BY fof.name`,
      { userId },
    );
    
    return result.records.map(record => record.get('fof').properties);
  } finally {
    await session.close();
  }
}
```

### 5. Mutual Friends

```cypher
MATCH (u1:User {id: $userId1})-[:FRIEND]->(mutual:User)<-[:FRIEND]-(u2:User {id: $userId2})
RETURN mutual
ORDER BY mutual.name
```

```typescript
async getMutualFriends(userId1: string, userId2: string): Promise<any[]> {
  const session = this.driver.session();
  try {
    const result = await session.run(
      `MATCH (u1:User {id: $userId1})-[:FRIEND]->(mutual:User)<-[:FRIEND]-(u2:User {id: $userId2})
       RETURN mutual
       ORDER BY mutual.name`,
      { userId1, userId2 },
    );
    
    return result.records.map(record => record.get('mutual').properties);
  } finally {
    await session.close();
  }
}
```

### 6. Shortest Path Algorithm

Find the shortest path between two users:

```cypher
MATCH path = shortestPath(
  (u1:User {id: $userId1})-[:FRIEND*]-(u2:User {id: $userId2})
)
RETURN path, length(path) as pathLength
```

```typescript
async getShortestPath(userId1: string, userId2: string): Promise<any> {
  const session = this.driver.session();
  try {
    const result = await session.run(
      `MATCH path = shortestPath(
         (u1:User {id: $userId1})-[:FRIEND*]-(u2:User {id: $userId2})
       )
       RETURN path, length(path) as pathLength`,
      { userId1, userId2 },
    );
    
    if (result.records.length === 0) {
      return null;
    }
    
    const path = result.records[0].get('path');
    const pathLength = result.records[0].get('pathLength').toNumber();
    
    return {
      pathLength,
      nodes: path.segments.map((segment: any) => segment.start.properties),
    };
  } finally {
    await session.close();
  }
}
```

### 7. Friend Suggestions

Suggest friends based on mutual connections:

```cypher
MATCH (u:User {id: $userId})-[:FRIEND]->()-[:FRIEND]->(suggested:User)
WHERE suggested.id <> $userId
AND NOT (u)-[:FRIEND]->(suggested)
WITH suggested, count(*) as mutualFriendsCount
RETURN suggested, mutualFriendsCount
ORDER BY mutualFriendsCount DESC
LIMIT $limit
```

```typescript
async suggestFriends(userId: string, limit: number = 5): Promise<any[]> {
  const session = this.driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User {id: $userId})-[:FRIEND]->()-[:FRIEND]->(suggested:User)
       WHERE suggested.id <> $userId
       AND NOT (u)-[:FRIEND]->(suggested)
       WITH suggested, count(*) as mutualFriendsCount
       RETURN suggested, mutualFriendsCount
       ORDER BY mutualFriendsCount DESC
       LIMIT $limit`,
      { userId, limit: neo4j.int(limit) },
    );
    
    return result.records.map(record => ({
      user: record.get('suggested').properties,
      mutualFriendsCount: record.get('mutualFriendsCount').toNumber(),
    }));
  } finally {
    await session.close();
  }
}
```

### 8. Aggregation - Friend Count

```cypher
MATCH (u:User)
OPTIONAL MATCH (u)-[f:FRIEND]->()
RETURN u, count(f) as friendCount
ORDER BY friendCount DESC
```

```typescript
async getUsersWithFriendCount(): Promise<any[]> {
  const session = this.driver.session();
  try {
    const result = await session.run(
      `MATCH (u:User)
       OPTIONAL MATCH (u)-[f:FRIEND]->()
       RETURN u, count(f) as friendCount
       ORDER BY friendCount DESC`,
    );
    
    return result.records.map(record => ({
      user: record.get('u').properties,
      friendCount: record.get('friendCount').toNumber(),
    }));
  } finally {
    await session.close();
  }
}
```

## API Endpoints

```
POST   /neo4j/users                         - Create user node
GET    /neo4j/users                         - Get all users
GET    /neo4j/users/:id                     - Get user by ID
PUT    /neo4j/users/:id                     - Update user
DELETE /neo4j/users/:id                     - Delete user (with relationships)
POST   /neo4j/users/friendships             - Create friendship
DELETE /neo4j/users/friendships             - Remove friendship
GET    /neo4j/users/:id/friends             - Get friends list
GET    /neo4j/users/:id/friends-of-friends  - Get 2nd degree connections
GET    /neo4j/users/:id/suggest-friends     - Suggest friends
GET    /neo4j/users/:id1/mutual-friends/:id2 - Get mutual friends
GET    /neo4j/users/:id1/shortest-path/:id2  - Find shortest path
GET    /neo4j/users/with-friend-count       - Get users with friend counts
```

## Cypher Query Patterns

### Pattern Matching

```cypher
// Simple match
MATCH (u:User)
RETURN u

// Match with properties
MATCH (u:User {name: 'Alice'})
RETURN u

// Match relationship
MATCH (u1:User)-[:FRIEND]->(u2:User)
RETURN u1, u2

// Match with variable length path
MATCH (u1:User)-[:FRIEND*1..3]->(u2:User)
RETURN u1, u2
```

### Creating Data

```cypher
// Create node
CREATE (u:User {name: 'Alice', age: 28})
RETURN u

// Create relationship
MATCH (u1:User {id: $id1})
MATCH (u2:User {id: $id2})
CREATE (u1)-[:FRIEND]->(u2)

// Create and return
CREATE (u:User {name: 'Bob'})
RETURN u
```

### Updating Data

```cypher
// Update properties
MATCH (u:User {id: $id})
SET u.name = $newName
RETURN u

// Add property
MATCH (u:User {id: $id})
SET u.verified = true
RETURN u
```

### Deleting Data

```cypher
// Delete node (must delete relationships first)
MATCH (u:User {id: $id})
DETACH DELETE u

// Delete relationship
MATCH (u1:User {id: $id1})-[f:FRIEND]-(u2:User {id: $id2})
DELETE f
```

## Best Practices

1. **Model relationships explicitly** - Make connections first-class citizens
2. **Use indexes** - Index frequently queried properties
3. **Limit traversal depth** - Use bounds on variable-length paths
4. **Use parameters** - Prevent Cypher injection
5. **Close sessions** - Always close Neo4j sessions after use
6. **Bidirectional relationships** - Create both directions for undirected graphs
7. **Batch operations** - Use UNWIND for bulk creates

## Performance Tips

1. **Create indexes:**
```cypher
CREATE INDEX user_id FOR (u:User) ON (u.id)
CREATE INDEX user_email FOR (u:User) ON (u.email)
```

2. **Use PROFILE to analyze queries:**
```cypher
PROFILE MATCH (u:User)-[:FRIEND*2]->()
RETURN count(u)
```

3. **Limit results:**
```cypher
MATCH (u:User)-[:FRIEND]->(friend)
RETURN friend
LIMIT 100
```

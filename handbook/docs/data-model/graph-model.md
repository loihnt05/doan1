---
sidebar_position: 4
---
# Mô hình Graph (Neo4j)

Mô hình đồ thị biểu diễn dữ liệu dưới dạng các nút (nodes - thực thể) và các mối quan hệ (relationships - kết nối). Nó xuất sắc trong việc quản lý dữ liệu có nhiều kết nối và các truy vấn quan hệ phức tạp.

## Khi nào nên sử dụng

- Dữ liệu có nhiều kết nối lẫn nhau
- Các truy vấn về mối quan hệ thường xuyên
- Cần duyệt qua các kết nối
- Mạng xã hội, hệ thống gợi ý
- Phát hiện gian lận, phân tích mạng
- Đồ thị tri thức
## Ví dụ: Mạng Xã hội

### Mô hình Dữ liệu

**Nút (Nodes):** User
- Thuộc tính: id, name, email, age, createdAt

**Quan hệ (Relationships):** FRIEND
- Thuộc tính: since, createdAt
- Loại: Hai chiều

### Trực quan hóa Schema

```
(User)-[:FRIEND]->(User)
```

## Các Khái niệm Chính

### 1. Tạo Nút (Creating Nodes)

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

### 2. Tạo Quan hệ (Creating Relationships)

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

### 3. Truy vấn Cypher

**Lấy danh sách bạn bè của người dùng:**

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

### 4. Duyệt Đồ thị - Bạn của Bạn

Tìm các kết nối bậc 2:

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

### 5. Bạn chung (Mutual Friends)

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

### 6. Thuật toán Đường đi Ngắn nhất

Tìm đường đi ngắn nhất giữa hai người dùng:

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

### 7. Gợi ý Kết bạn

Gợi ý bạn bè dựa trên các kết nối chung:

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

### 8. Tổng hợp - Đếm số Bạn bè

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

## Các API Endpoints

```
POST   /neo4j/users                         - Tạo nút người dùng
GET    /neo4j/users                         - Lấy tất cả người dùng
GET    /neo4j/users/:id                     - Lấy người dùng theo ID
PUT    /neo4j/users/:id                     - Cập nhật người dùng
DELETE /neo4j/users/:id                     - Xóa người dùng (cùng quan hệ)
POST   /neo4j/users/friendships             - Tạo quan hệ bạn bè
DELETE /neo4j/users/friendships             - Xóa quan hệ bạn bè
GET    /neo4j/users/:id/friends             - Lấy danh sách bạn bè
GET    /neo4j/users/:id/friends-of-friends  - Lấy kết nối bậc 2
GET    /neo4j/users/:id/suggest-friends     - Gợi ý bạn bè
GET    /neo4j/users/:id1/mutual-friends/:id2 - Lấy bạn chung
GET    /neo4j/users/:id1/shortest-path/:id2  - Tìm đường đi ngắn nhất
GET    /neo4j/users/with-friend-count       - Lấy người dùng với số lượng bạn
```

## Các Mẫu Truy vấn Cypher

### Khớp Mẫu (Pattern Matching)

```cypher
// Khớp đơn giản
MATCH (u:User)
RETURN u

// Khớp với thuộc tính
MATCH (u:User {name: 'Alice'})
RETURN u

// Khớp quan hệ
MATCH (u1:User)-[:FRIEND]->(u2:User)
RETURN u1, u2

// Khớp với đường đi độ dài biến đổi
MATCH (u1:User)-[:FRIEND*1..3]->(u2:User)
RETURN u1, u2
```

### Tạo Dữ liệu

```cypher
// Tạo nút
CREATE (u:User {name: 'Alice', age: 28})
RETURN u

// Tạo quan hệ
MATCH (u1:User {id: $id1})
MATCH (u2:User {id: $id2})
CREATE (u1)-[:FRIEND]->(u2)

// Tạo và trả về
CREATE (u:User {name: 'Bob'})
RETURN u
```

### Cập nhật Dữ liệu

```cypher
// Cập nhật thuộc tính
MATCH (u:User {id: $id})
SET u.name = $newName
RETURN u

// Thêm thuộc tính
MATCH (u:User {id: $id})
SET u.verified = true
RETURN u
```

### Xóa Dữ liệu

```cypher
// Xóa nút (phải xóa quan hệ trước)
MATCH (u:User {id: $id})
DETACH DELETE u

// Xóa quan hệ
MATCH (u1:User {id: $id1})-[f:FRIEND]-(u2:User {id: $id2})
DELETE f
```

## Best Practices

1. **Mô hình hóa quan hệ rõ ràng** - Biến các kết nối thành công dân hạng nhất
2. **Sử dụng chỉ mục** - Đánh chỉ mục các thuộc tính được truy vấn thường xuyên
3. **Giới hạn độ sâu duyệt** - Sử dụng giới hạn trên đường đi độ dài biến đổi
4. **Sử dụng tham số** - Ngăn chặn Cypher injection
5. **Đóng sessions** - Luôn đóng Neo4j sessions sau khi sử dụng
6. **Quan hệ hai chiều** - Tạo cả hai hướng cho đồ thị vô hướng
7. **Thao tác hàng loạt** - Sử dụng UNWIND cho tạo hàng loạt

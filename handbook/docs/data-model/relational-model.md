---
sidebar_position: 2
---
# Mô hình Quan hệ (PostgreSQL + Sequelize)

Mô hình quan hệ tổ chức dữ liệu thành các bảng (relations) với các hàng và cột. Đây là mô hình cơ sở dữ liệu trưởng thành và được sử dụng rộng rãi nhất, hoàn hảo cho dữ liệu có cấu trúc với các mối quan hệ rõ ràng.

## Khi nào nên sử dụng

-  Dữ liệu có cấu trúc được định nghĩa rõ ràng
-  Cần giao dịch ACID (Atomicity, Consistency, Isolation, Durability)
-  Truy vấn phức tạp với joins trên nhiều bảng
-  Tính toàn vẹn dữ liệu là quan trọng
-  Yêu cầu tính nhất quán mạnh

## Ví dụ: Quản lý Người dùng

### Định nghĩa Schema

```typescript
import { Table, Column, Model, DataType, Index } from 'sequelize-typescript';

@Table({
  tableName: 'users',
  timestamps: true,
})
export class User extends Model {
  @Column({
    type: DataType.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  })
  declare id: number;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  name: string;

  @Index('idx_user_age') // BTREE index
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  age: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
    defaultValue: DataType.NOW,
  })
  declare createdAt: Date;
}
```

## Các Khái niệm Chính

### 1. Chỉ mục BTREE

Chỉ mục tăng tốc độ truy vấn bằng cách tạo cấu trúc cây được sắp xếp:

```typescript
@Index('idx_user_age')
@Column({
  type: DataType.INTEGER,
  allowNull: false,
})
age: number;
```

**Lợi ích:**
- Truy vấn phạm vi nhanh (`age >= 18`)
- Sắp xếp hiệu quả
- Tra cứu nhanh chóng

### 2. Thao tác CRUD

**Tạo mới (Create):**
```typescript
async createUser(createUserDto: CreateUserDto): Promise<User> {
  return this.userModel.create({
    name: createUserDto.name,
    age: createUserDto.age,
  });
}
```

**Đọc (Read):**
```typescript
async findAllUsers(): Promise<User[]> {
  return this.userModel.findAll();
}

async findUserById(id: number): Promise<User | null> {
  return this.userModel.findByPk(id);
}
```

**Cập nhật (Update):**
```typescript
async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<User> {
  const user = await this.userModel.findByPk(id);
  return user.update(updateUserDto);
}
```

**Xóa (Delete):**
```typescript
async deleteUser(id: number): Promise<void> {
  const user = await this.userModel.findByPk(id);
  await user.destroy();
}
```

### 3. Tối ưu hóa Truy vấn

**Sử dụng chỉ mục BTREE để lọc hiệu quả:**

```typescript
async findAdultUsers(): Promise<User[]> {
  return this.userModel.findAll({
    where: {
      age: {
        [Op.gte]: 18, // Uses BTREE index
      },
    },
    order: [['createdAt', 'DESC']],
  });
}
```

### 4. Giao dịch (Transactions)

Giao dịch đảm bảo tính nhất quán của dữ liệu:

```typescript
async createUsersTransaction(users: CreateUserDto[]): Promise<User[]> {
  const transaction = await this.sequelize.transaction();
  
  try {
    const createdUsers: User[] = [];
    
    for (const userData of users) {
      const user = await this.userModel.create(userData, { transaction });
      createdUsers.push(user);
    }
    
    await transaction.commit(); // Tất cả thành công
    return createdUsers;
  } catch (error) {
    await transaction.rollback(); // Hoặc tất cả thất bại
    throw error;
  }
}
```

### 5. Query Builder

Sequelize cung cấp một query builder mạnh mẽ:

```typescript
async findUsersWithComplexQuery(
  minAge?: number,
  maxAge?: number,
  namePattern?: string,
): Promise<User[]> {
  const whereConditions: any = {};

  if (minAge !== undefined || maxAge !== undefined) {
    whereConditions.age = {};
    if (minAge !== undefined) {
      whereConditions.age[Op.gte] = minAge;
    }
    if (maxAge !== undefined) {
      whereConditions.age[Op.lte] = maxAge;
    }
  }

  if (namePattern) {
    whereConditions.name = {
      [Op.like]: `%${namePattern}%`,
    };
  }

  return this.userModel.findAll({
    where: whereConditions,
    order: [['createdAt', 'DESC']],
  });
}
```

### 6. Raw SQL Queries

For complex queries, you can use raw SQL:

```typescript
async findUsersByRawSQL(minAge: number): Promise<any[]> {
  const [results] = await this.sequelize.query(
    'SELECT * FROM users WHERE age >= :minAge ORDER BY "createdAt" DESC',
    {
      replacements: { minAge },
    },
  );
  return results;
}
```

### 7. Aggregations

```typescript
async getUserStatistics(): Promise<any> {
  const [results] = await this.sequelize.query(`
    SELECT 
      COUNT(*) as total_users,
      AVG(age) as average_age,
      MIN(age) as youngest_age,
      MAX(age) as oldest_age
    FROM users
  `);
  return results[0];
}
```

## Các API Endpoints

```
POST   /postgres/users              - Tạo người dùng
GET    /postgres/users              - Lấy tất cả người dùng
GET    /postgres/users/:id          - Lấy người dùng theo ID
PUT    /postgres/users/:id          - Cập nhật người dùng
DELETE /postgres/users/:id          - Xóa người dùng
GET    /postgres/users/adults       - Tìm người dùng >= 18 tuổi
POST   /postgres/users/batch        - Tạo nhiều người dùng (transaction)
GET    /postgres/users/statistics   - Lấy thống kê người dùng
GET    /postgres/users/search       - Tìm kiếm với bộ lọc
GET    /postgres/users/raw-sql      - Ví dụ truy vấn SQL thuần
```

## Phương pháp Hay nhất

1. **Use indexes wisely** - Index frequently queried columns
2. **Normalize data** - Reduce redundancy through proper table design
3. **Use transactions** - For operations that must succeed or fail together
4. **Optimize queries** - Use EXPLAIN to analyze query performance
5. **Validate input** - Use constraints and validation at the model level
6. **Handle NULL values** - Be explicit about nullable columns


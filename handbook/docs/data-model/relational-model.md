---
sidebar_position: 2
---
# Relational Model (PostgreSQL + Sequelize)

The relational model organizes data into tables (relations) with rows and columns. It's the most mature and widely-used database model, perfect for structured data with clear relationships.

## When to Use

-  Data has a well-defined structure
-  Need ACID transactions (Atomicity, Consistency, Isolation, Durability)
-  Complex queries with joins across multiple tables
-  Data integrity is critical 
-  Strong consistency requirements

## Example: User Management

### Schema Definition

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

## Key Concepts

### 1. BTREE Index

Indexes speed up queries by creating a sorted tree structure:

```typescript
@Index('idx_user_age')
@Column({
  type: DataType.INTEGER,
  allowNull: false,
})
age: number;
```

**Benefits:**
- Fast range queries (`age >= 18`)
- Efficient sorting
- Quick lookups

### 2. CRUD Operations

**Create:**
```typescript
async createUser(createUserDto: CreateUserDto): Promise<User> {
  return this.userModel.create({
    name: createUserDto.name,
    age: createUserDto.age,
  });
}
```

**Read:**
```typescript
async findAllUsers(): Promise<User[]> {
  return this.userModel.findAll();
}

async findUserById(id: number): Promise<User | null> {
  return this.userModel.findByPk(id);
}
```

**Update:**
```typescript
async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<User> {
  const user = await this.userModel.findByPk(id);
  return user.update(updateUserDto);
}
```

**Delete:**
```typescript
async deleteUser(id: number): Promise<void> {
  const user = await this.userModel.findByPk(id);
  await user.destroy();
}
```

### 3. Query Optimization

**Using BTREE index for efficient filtering:**

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

### 4. Transactions

Transactions ensure data consistency:

```typescript
async createUsersTransaction(users: CreateUserDto[]): Promise<User[]> {
  const transaction = await this.sequelize.transaction();
  
  try {
    const createdUsers: User[] = [];
    
    for (const userData of users) {
      const user = await this.userModel.create(userData, { transaction });
      createdUsers.push(user);
    }
    
    await transaction.commit(); // All succeed
    return createdUsers;
  } catch (error) {
    await transaction.rollback(); // Or all fail
    throw error;
  }
}
```

### 5. Query Builder

Sequelize provides a powerful query builder:

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

## API Endpoints

```
POST   /postgres/users              - Create user
GET    /postgres/users              - Get all users
GET    /postgres/users/:id          - Get user by ID
PUT    /postgres/users/:id          - Update user
DELETE /postgres/users/:id          - Delete user
GET    /postgres/users/adults       - Find users age >= 18
POST   /postgres/users/batch        - Create multiple users (transaction)
GET    /postgres/users/statistics   - Get user statistics
GET    /postgres/users/search       - Search with filters
GET    /postgres/users/raw-sql      - Raw SQL query example
```

## Best Practices

1. **Use indexes wisely** - Index frequently queried columns
2. **Normalize data** - Reduce redundancy through proper table design
3. **Use transactions** - For operations that must succeed or fail together
4. **Optimize queries** - Use EXPLAIN to analyze query performance
5. **Validate input** - Use constraints and validation at the model level
6. **Handle NULL values** - Be explicit about nullable columns


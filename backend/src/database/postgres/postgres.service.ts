import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import { Sequelize } from 'sequelize-typescript';
import { User } from './user.model';

export interface CreateUserDto {
  name: string;
  age: number;
}

export interface UpdateUserDto {
  name?: string;
  age?: number;
}

@Injectable()
export class PostgresService {
  constructor(
    @InjectModel(User)
    private userModel: typeof User,
    private sequelize: Sequelize,
  ) {}

  // CREATE - Create a new user
  async createUser(createUserDto: CreateUserDto): Promise<User> {
    return this.userModel.create({
      name: createUserDto.name,
      age: createUserDto.age,
    });
  }

  // READ - Get all users
  async findAllUsers(): Promise<User[]> {
    return this.userModel.findAll();
  }

  // READ - Get user by ID
  async findUserById(id: number): Promise<User | null> {
    return this.userModel.findByPk(id);
  }

  // UPDATE - Update user
  async updateUser(id: number, updateUserDto: UpdateUserDto): Promise<User> {
    const user = await this.userModel.findByPk(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user.update(updateUserDto);
  }

  // DELETE - Delete user
  async deleteUser(id: number): Promise<void> {
    const user = await this.userModel.findByPk(id);
    if (!user) {
      throw new Error('User not found');
    }
    await user.destroy();
  }

  // OPTIMIZED QUERY - Find users age >= 18, sorted by createdAt
  // Uses BTREE index on age for efficient filtering
  async findAdultUsers(): Promise<User[]> {
    return this.userModel.findAll({
      where: {
        age: {
          [Op.gte]: 18, // Greater than or equal to 18
        },
      },
      order: [['createdAt', 'DESC']], // Sort by creation date
    });
  }

  // TRANSACTION EXAMPLE - Create multiple users atomically
  async createUsersTransaction(users: CreateUserDto[]): Promise<User[]> {
    const transaction = await this.sequelize.transaction();

    try {
      const createdUsers: User[] = [];

      for (const userData of users) {
        const user = await this.userModel.create(
          {
            name: userData.name,
            age: userData.age,
          },
          { transaction },
        );
        createdUsers.push(user);
      }

      // Commit transaction if all operations succeed
      await transaction.commit();
      return createdUsers;
    } catch (error) {
      // Rollback transaction if any operation fails
      await transaction.rollback();
      throw error;
    }
  }

  // RAW SQL QUERY EXAMPLE
  async findUsersByRawSQL(minAge: number): Promise<any[]> {
    const [results] = await this.sequelize.query(
      'SELECT * FROM users WHERE age >= :minAge ORDER BY "createdAt" DESC',
      {
        replacements: { minAge },
      },
    );
    return results;
  }

  // QUERY BUILDER EXAMPLE - Complex query with multiple conditions
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

  // AGGREGATION EXAMPLE - Get statistics
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

  // Count users by age range
  async countUsersByAgeRange(): Promise<any[]> {
    const [results] = await this.sequelize.query(`
      SELECT 
        CASE 
          WHEN age < 18 THEN 'Minor'
          WHEN age >= 18 AND age < 30 THEN 'Young Adult'
          WHEN age >= 30 AND age < 50 THEN 'Adult'
          ELSE 'Senior'
        END as age_group,
        COUNT(*) as count
      FROM users
      GROUP BY age_group
      ORDER BY age_group
    `);
    return results;
  }
}

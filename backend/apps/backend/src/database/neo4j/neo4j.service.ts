import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import neo4j, { Driver, Session } from 'neo4j-driver';

export interface CreateUserDto {
  name: string;
  email: string;
  age?: number;
}

export interface CreateFriendshipDto {
  userId1: string;
  userId2: string;
  since?: Date;
}

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private driver: Driver;

  async onModuleInit() {
    const uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    const user = process.env.NEO4J_USER || 'neo4j';
    const password = process.env.NEO4J_PASSWORD || 'password';

    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));

    try {
      await this.driver.verifyConnectivity();
      console.log('Neo4j connection established');
    } catch (error) {
      console.error('Neo4j connection failed:', error);
    }
  }

  async onModuleDestroy() {
    await this.driver.close();
  }

  private getSession(): Session {
    return this.driver.session();
  }

  // CREATE - Create a user node
  async createUser(createUserDto: CreateUserDto): Promise<any> {
    const session = this.getSession();
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

  // READ - Get all users
  async findAllUsers(): Promise<any[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        'MATCH (u:User) RETURN u ORDER BY u.createdAt DESC',
      );

      return result.records.map((record) => record.get('u').properties);
    } finally {
      await session.close();
    }
  }

  // READ - Find user by ID
  async findUserById(id: string): Promise<any> {
    const session = this.getSession();
    try {
      const result = await session.run('MATCH (u:User {id: $id}) RETURN u', {
        id,
      });

      if (result.records.length === 0) {
        return null;
      }

      return result.records[0].get('u').properties;
    } finally {
      await session.close();
    }
  }

  // UPDATE - Update user
  async updateUser(id: string, updates: Partial<CreateUserDto>): Promise<any> {
    const session = this.getSession();
    try {
      const setClauses = Object.keys(updates)
        .map((key) => `u.${key} = $${key}`)
        .join(', ');

      const result = await session.run(
        `MATCH (u:User {id: $id})
         SET ${setClauses}
         RETURN u`,
        { id, ...updates },
      );

      if (result.records.length === 0) {
        return null;
      }

      return result.records[0].get('u').properties;
    } finally {
      await session.close();
    }
  }

  // DELETE - Delete user
  async deleteUser(id: string): Promise<boolean> {
    const session = this.getSession();
    try {
      const result = await session.run(
        'MATCH (u:User {id: $id}) DETACH DELETE u RETURN count(u) as deleted',
        { id },
      );

      return result.records[0].get('deleted').toNumber() > 0;
    } finally {
      await session.close();
    }
  }

  // CREATE RELATIONSHIP - Create friendship between two users
  async createFriendship(
    createFriendshipDto: CreateFriendshipDto,
  ): Promise<any> {
    const session = this.getSession();
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
          userId1: createFriendshipDto.userId1,
          userId2: createFriendshipDto.userId2,
          since: createFriendshipDto.since || new Date().toISOString(),
        },
      );

      if (result.records.length === 0) {
        throw new Error('One or both users not found');
      }

      return {
        user1: result.records[0].get('u1').properties,
        user2: result.records[0].get('u2').properties,
        friendship: result.records[0].get('f').properties,
      };
    } finally {
      await session.close();
    }
  }

  // QUERY - Get friends of a user
  async getFriendsOfUser(userId: string): Promise<any[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (u:User {id: $userId})-[f:FRIEND]->(friend:User)
         RETURN friend, f
         ORDER BY friend.name`,
        { userId },
      );

      return result.records.map((record) => ({
        user: record.get('friend').properties,
        friendship: record.get('f').properties,
      }));
    } finally {
      await session.close();
    }
  }

  // QUERY - Get mutual friends between two users
  async getMutualFriends(userId1: string, userId2: string): Promise<any[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (u1:User {id: $userId1})-[:FRIEND]->(mutual:User)<-[:FRIEND]-(u2:User {id: $userId2})
         RETURN mutual
         ORDER BY mutual.name`,
        { userId1, userId2 },
      );

      return result.records.map((record) => record.get('mutual').properties);
    } finally {
      await session.close();
    }
  }

  // QUERY - Find friends of friends (2nd degree connections)
  async getFriendsOfFriends(userId: string): Promise<any[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (u:User {id: $userId})-[:FRIEND]->()-[:FRIEND]->(fof:User)
         WHERE fof.id <> $userId
         AND NOT (u)-[:FRIEND]->(fof)
         RETURN DISTINCT fof
         ORDER BY fof.name`,
        { userId },
      );

      return result.records.map((record) => record.get('fof').properties);
    } finally {
      await session.close();
    }
  }

  // QUERY - Get user with friend count
  async getUsersWithFriendCount(): Promise<any[]> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (u:User)
         OPTIONAL MATCH (u)-[f:FRIEND]->()
         RETURN u, count(f) as friendCount
         ORDER BY friendCount DESC`,
      );

      return result.records.map((record) => ({
        user: record.get('u').properties,
        friendCount: record.get('friendCount').toNumber(),
      }));
    } finally {
      await session.close();
    }
  }

  // QUERY - Shortest path between two users
  async getShortestPath(userId1: string, userId2: string): Promise<any> {
    const session = this.getSession();
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

  // QUERY - Remove friendship
  async removeFriendship(userId1: string, userId2: string): Promise<boolean> {
    const session = this.getSession();
    try {
      const result = await session.run(
        `MATCH (u1:User {id: $userId1})-[f:FRIEND]-(u2:User {id: $userId2})
         DELETE f
         RETURN count(f) as deleted`,
        { userId1, userId2 },
      );

      return result.records[0].get('deleted').toNumber() > 0;
    } finally {
      await session.close();
    }
  }

  // ADVANCED QUERY - Suggest friends (friends of friends not already friends)
  async suggestFriends(userId: string, limit: number = 5): Promise<any[]> {
    const session = this.getSession();
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

      return result.records.map((record) => ({
        user: record.get('suggested').properties,
        mutualFriendsCount: record.get('mutualFriendsCount').toNumber(),
      }));
    } finally {
      await session.close();
    }
  }
}

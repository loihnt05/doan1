import { Inject, Injectable } from '@nestjs/common';
import { USER_CACHE_KEYS } from '../../cache/decorators/cache.keys.js';
import { Cacheable, CacheInvalidation } from '../../cache/decorators/index.js';
import { User } from '../domain/user.entity';
import type { UserRepository } from '../domain/user.repository';

@Injectable()
export class UserService {
  constructor(
    @Inject('UserRepository') private readonly userRepository: UserRepository,
  ) {}

  @Cacheable(USER_CACHE_KEYS.GET_ALL_USERS)
  async getAllUsers(): Promise<User[]> {
    return this.userRepository.findAll();
  }

  @Cacheable(USER_CACHE_KEYS.GET_USER_BY_ID, { key: 'id' })
  async getUserById(id: number): Promise<User | undefined> {
    return this.userRepository.findById(id);
  }

  @CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS)
  async createUser(name: string, email: string): Promise<User> {
    const id = Date.now(); // business logic
    const user = new User(id, name, email);
    return this.userRepository.create(user);
  }

  @CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS, { key: 'id' })
  @CacheInvalidation(USER_CACHE_KEYS.GET_USER_BY_ID, { key: 'id' })
  async updateUser(id: number, user: Partial<User>): Promise<User | undefined> {
    return await this.userRepository.update(id, user);
  }

  @CacheInvalidation(USER_CACHE_KEYS.GET_ALL_USERS)
  @CacheInvalidation(USER_CACHE_KEYS.GET_USER_BY_ID, { key: 'id' })
  async deleteUser(id: number): Promise<void> {
    return await this.userRepository.delete(id);
  }
}

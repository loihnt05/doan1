import { Injectable } from '@nestjs/common';
import { UserRepository } from '../domain/user.repository';
import { User } from '../domain/user.entity';

@Injectable()
export class InMemoryUserRepository implements UserRepository {
  private users: User[] = [];

  // eslint-disable-next-line @typescript-eslint/require-await
  async findAll(): Promise<User[]> {
    return this.users;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async findById(id: number): Promise<User | undefined> {
    return this.users.find((user) => user.id === id);
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async create(user: User): Promise<User> {
    this.users.push(user);
    return user;
  }
}
// note: do not need to await because all operations are synchronous

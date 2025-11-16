
import { Injectable } from '@nestjs/common';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/createUser.dto';

// export type User = {
//   userId: number;
//   username: string;
//   password: string;
// };

@Injectable()
export class UsersService {
  private users: User[] = []

  async findAll(): Promise<User[]> {
    return this.users;
  }

  async findOne(username: string): Promise<User | undefined> {
    return this.users.find(user => user.username === username);
  }

  async create(createUserDto: CreateUserDto): Promise<User> {
    const newUser = new User();
    newUser.id = this.users.length + 1;
    newUser.username = createUserDto.username;
    newUser.password = createUserDto.password;

    // Manually trigger password hashing since @BeforeInsert won't work without database
    await newUser.hashPassword();
    this.users.push(newUser);
    return newUser;
  }
  async removeAll(): Promise<string> {
    this.users = [];
    return 'Removed all users';
  }
}

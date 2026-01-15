
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService
  ) {}

  async signIn(
    username: string,
    pass: string,
  ){
    const user = await this.usersService.findOne(username);
    console.log('Comparing passwords:', pass, user?.password);
    if(!user)
      throw new UnauthorizedException('User not found');

    if (!(await compare(pass, user.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return user;
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { UserService } from '../application/user.service';
import { User } from '../domain/user.entity';

@Controller('user')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('all')
  getAll() {
    return this.userService.getAllUsers();
  }

  @Get(':id')
  getById(@Param('id') id: number) {
    return this.userService.getUserById(+id);
  }

  @Post()
  create(@Body() body: { name: string; email: string }) {
    return this.userService.createUser(body.name, body.email);
  }

  @Patch(':id')
  update(@Param('id') id: number, @Body() body: Partial<User>) {
    return this.userService.updateUser(+id, body);
  }

  @Delete(':id')
  delete(@Param('id') id: number) {
    return this.userService.deleteUser(+id);
  }
}

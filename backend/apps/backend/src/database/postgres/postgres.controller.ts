import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import type { CreateUserDto, UpdateUserDto } from './postgres.service';
import { PostgresService } from './postgres.service';

@Controller('postgres/users')
export class PostgresController {
  constructor(private readonly postgresService: PostgresService) {}

  @Post()
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.postgresService.createUser(createUserDto);
  }

  @Get()
  async getAllUsers() {
    return this.postgresService.findAllUsers();
  }

  @Get('adults')
  async getAdultUsers() {
    return this.postgresService.findAdultUsers();
  }

  @Get('statistics')
  async getStatistics() {
    return this.postgresService.getUserStatistics();
  }

  @Get('age-groups')
  async getAgeGroups() {
    return this.postgresService.countUsersByAgeRange();
  }

  @Get('search')
  async searchUsers(
    @Query('minAge') minAge?: string,
    @Query('maxAge') maxAge?: string,
    @Query('name') name?: string,
  ) {
    return this.postgresService.findUsersWithComplexQuery(
      minAge ? parseInt(minAge) : undefined,
      maxAge ? parseInt(maxAge) : undefined,
      name,
    );
  }

  @Get('raw-sql')
  async getUsersByRawSQL(@Query('minAge') minAge: string = '18') {
    return this.postgresService.findUsersByRawSQL(parseInt(minAge));
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return this.postgresService.findUserById(parseInt(id));
  }

  @Put(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ) {
    return this.postgresService.updateUser(parseInt(id), updateUserDto);
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    await this.postgresService.deleteUser(parseInt(id));
    return { message: 'User deleted successfully' };
  }

  @Post('batch')
  async createUsersInTransaction(@Body() users: CreateUserDto[]) {
    return this.postgresService.createUsersTransaction(users);
  }
}

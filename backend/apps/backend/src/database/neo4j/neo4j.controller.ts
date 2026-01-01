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
import type { CreateFriendshipDto, CreateUserDto } from './neo4j.service';
import { Neo4jService } from './neo4j.service';

@Controller('neo4j/users')
export class Neo4jController {
  constructor(private readonly neo4jService: Neo4jService) {}

  @Post()
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.neo4jService.createUser(createUserDto);
  }

  @Get()
  async getAllUsers() {
    return this.neo4jService.findAllUsers();
  }

  @Get('with-friend-count')
  async getUsersWithFriendCount() {
    return this.neo4jService.getUsersWithFriendCount();
  }

  @Get(':id')
  async getUserById(@Param('id') id: string) {
    return this.neo4jService.findUserById(id);
  }

  @Put(':id')
  async updateUser(
    @Param('id') id: string,
    @Body() updates: Partial<CreateUserDto>,
  ) {
    return this.neo4jService.updateUser(id, updates);
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    const deleted = await this.neo4jService.deleteUser(id);
    return { deleted };
  }

  @Post('friendships')
  async createFriendship(@Body() createFriendshipDto: CreateFriendshipDto) {
    return this.neo4jService.createFriendship(createFriendshipDto);
  }

  @Delete('friendships')
  async removeFriendship(
    @Query('userId1') userId1: string,
    @Query('userId2') userId2: string,
  ) {
    const deleted = await this.neo4jService.removeFriendship(userId1, userId2);
    return { deleted };
  }

  @Get(':id/friends')
  async getFriends(@Param('id') id: string) {
    return this.neo4jService.getFriendsOfUser(id);
  }

  @Get(':id/friends-of-friends')
  async getFriendsOfFriends(@Param('id') id: string) {
    return this.neo4jService.getFriendsOfFriends(id);
  }

  @Get(':id/suggest-friends')
  async suggestFriends(
    @Param('id') id: string,
    @Query('limit') limit?: string,
  ) {
    return this.neo4jService.suggestFriends(id, limit ? parseInt(limit) : 5);
  }

  @Get(':id1/mutual-friends/:id2')
  async getMutualFriends(@Param('id1') id1: string, @Param('id2') id2: string) {
    return this.neo4jService.getMutualFriends(id1, id2);
  }

  @Get(':id1/shortest-path/:id2')
  async getShortestPath(@Param('id1') id1: string, @Param('id2') id2: string) {
    return this.neo4jService.getShortestPath(id1, id2);
  }
}

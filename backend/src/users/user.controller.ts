/*
https://docs.nestjs.com/controllers#controllers
*/

import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/createUser.dto';

@Controller('user')
export class UserController {
    constructor(private userService:UsersService){}
    @Get()
    findAll(){
        return this.userService.findAll();
    }
    @Get(':username')
    findOne(@Param('username') username: string){
        return this.userService.findOne(username);
    }
    @Post()
    create(@Body() createUserDto: CreateUserDto){
        return this.userService.create(createUserDto);
    }
    @Delete()
    removeAll(){
        // For testing purpose only
        return this.userService.removeAll();
    }
}

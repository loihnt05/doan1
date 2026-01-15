import { UserController } from '../../../src/users/user.controller';
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthService } from '../../../src/auth/auth.service';
import { AuthController } from '../../../src/auth/auth.controller';
import { AuthModule } from '../../../src/auth/auth.module';
import { UsersService } from '../../../src/users/users.service';
import { UsersModule } from '../../../src/users/users.module';

@Module({
  imports: [AuthModule, UsersModule],
  controllers: [UserController, AppController, AuthController],
  providers: [AppService, AuthService, UsersService],
})
export class AppModule {}

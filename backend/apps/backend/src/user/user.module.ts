import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { UserController } from './presentation/user.controller';
import { UserService } from './application/user.service';
import { InMemoryUserRepository } from './infrastructure/user.repository.memory';

@Module({
  imports: [ConfigModule],
  providers: [
    UserService,
    {
      provide: 'UserRepository',
      useClass: InMemoryUserRepository,
    },
  ],
  controllers: [UserController],
})
export class UserModule {}

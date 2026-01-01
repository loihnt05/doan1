import { Module } from '@nestjs/common';
import { SequelizeModule } from '@nestjs/sequelize';
import { PostgresController } from './postgres.controller';
import { PostgresService } from './postgres.service';
import { User } from './user.model';

@Module({
  imports: [
    SequelizeModule.forRoot({
      dialect: 'postgres',
      host: process.env.POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      username: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres',
      database: process.env.POSTGRES_DB || 'nestjs_demo',
      models: [User],
      autoLoadModels: true,
      synchronize: true, // Only for development
      logging: console.log, // Enable SQL query logging
    }),
    SequelizeModule.forFeature([User]),
  ],
  controllers: [PostgresController],
  providers: [PostgresService],
  exports: [PostgresService],
})
export class PostgresModule {}

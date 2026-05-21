import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';

/**
 * Feature module that encapsulates everything related to user management.
 *
 * Registers the {@link User} entity with TypeORM and exposes the
 * {@link UserController} and {@link UserService}.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

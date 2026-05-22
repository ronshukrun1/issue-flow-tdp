import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { CommentModule } from '../comment/comment.module';

/**
 * Feature module that encapsulates everything related to user management.
 *
 * Registers the {@link User} entity with TypeORM and exposes the
 * {@link UserController} and {@link UserService}.
 *
 * Uses `forwardRef` for {@link CommentModule} to break the circular
 * dependency: `UserController` needs `CommentService` for the mentions
 * endpoint, while `CommentModule` imports `UserModule` for mention
 * resolution.
 */
@Module({
  imports: [TypeOrmModule.forFeature([User]), forwardRef(() => CommentModule)],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}

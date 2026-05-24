import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Comment } from './comment.entity';
import { CommentMention } from './comment-mention.entity';
import { CommentService } from './comment.service';
import { CommentController } from './comment.controller';
import { TicketModule } from '../ticket/ticket.module';
import { UserModule } from '../user/user.module';

/**
 * Feature module for comment and `@mention` management.
 *
 * Uses `forwardRef` for {@link UserModule} to break the circular
 * dependency: `UserModule` imports `CommentModule` for the mentions
 * endpoint, while `CommentModule` imports `UserModule` to resolve
 * mentioned usernames.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, CommentMention]),
    TicketModule,
    forwardRef(() => UserModule),
  ],
  controllers: [CommentController],
  providers: [CommentService],
  exports: [CommentService],
})
export class CommentModule {}

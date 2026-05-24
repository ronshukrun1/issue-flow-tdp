import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Exclude } from 'class-transformer';
import { Comment } from './comment.entity';
import { User } from '../user/user.entity';

/**
 * Join table linking comments to mentioned users (`comment_mentions`).
 *
 * Column names match the legacy TypeORM `@JoinTable` defaults (`commentsId`,
 * `usersId`). `onDelete: 'CASCADE'` on `usersId` removes mention links when a
 * user is hard-deleted without deleting comments or plain-text `@username` tokens.
 */
@Entity('comment_mentions')
export class CommentMention {
  @PrimaryColumn({ name: 'commentsId' })
  commentsId!: number;

  @PrimaryColumn({ name: 'usersId' })
  usersId!: number;

  @ManyToOne(() => Comment, (comment) => comment.mentionLinks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'commentsId' })
  @Exclude()
  comment?: Comment;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'usersId' })
  @Exclude()
  user?: User;
}

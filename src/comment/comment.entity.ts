import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  VersionColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Ticket } from '../ticket/ticket.entity';
import { User } from '../user/user.entity';
import { CommentMention } from './comment-mention.entity';

/**
 * Represents a user comment on a ticket.
 *
 * Comments track `@username` mentions via the {@link CommentMention}
 * join entity (`comment_mentions`). The mention list is re-evaluated
 * on every create and update.
 *
 * Internal fields (`version`, `createdAt`, `updatedAt`) and
 * navigation properties are excluded from serialised API responses
 * via `@Exclude()` to match the README contract.
 */
@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  ticketId!: number;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  @Exclude()
  ticket!: Ticket;

  @Column()
  authorId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  @Exclude()
  author!: User;

  @Column({ type: 'text' })
  content!: string;

  /**
   * Persisted mention join rows. `userId` FK uses `onDelete: 'CASCADE'`
   * on {@link CommentMention} so user hard-delete removes links only.
   */
  @OneToMany(() => CommentMention, (link) => link.comment, {
    cascade: true,
  })
  @Exclude()
  mentionLinks?: CommentMention[];

  /**
   * Resolved users for API responses (`id`, `username`, `fullName`).
   * Populated by {@link CommentService} — not a direct DB column.
   */
  mentionedUsers!: User[];

  /** Optimistic lock version — prevents simultaneous edits (TDP 2.5). */
  @VersionColumn()
  @Exclude()
  version!: number;

  @CreateDateColumn()
  @Exclude()
  createdAt!: Date;

  @UpdateDateColumn()
  @Exclude()
  updatedAt!: Date;
}

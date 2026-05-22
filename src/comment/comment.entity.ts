import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { Ticket } from '../ticket/ticket.entity';
import { User } from '../user/user.entity';

/**
 * Represents a user comment on a ticket.
 *
 * Comments track `@username` mentions via a many-to-many join table
 * (`comment_mentions`). The mention list is re-evaluated on every
 * create and update.
 */
@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  ticketId!: number;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  ticket!: Ticket;

  @Column()
  authorId!: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'authorId' })
  author!: User;

  @Column({ type: 'text' })
  content!: string;

  /**
   * Users mentioned via `@username` in the comment content.
   * Eagerly populated in comment responses with `id`, `username`,
   * and `fullName` only.
   */
  @ManyToMany(() => User)
  @JoinTable({ name: 'comment_mentions' })
  mentionedUsers!: User[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

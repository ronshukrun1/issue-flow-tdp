import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  VersionColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  ManyToMany,
  JoinColumn,
  JoinTable,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Project } from '../project/project.entity';
import { User } from '../user/user.entity';
import { TicketStatus } from './enums/ticket-status.enum';
import { TicketPriority } from './enums/ticket-priority.enum';
import { TicketType } from './enums/ticket-type.enum';

/**
 * Represents a work item (issue) tracked within a project.
 *
 * Tickets support soft-delete via `@DeleteDateColumn` and carry an
 * `isOverdue` flag that the auto-escalation scheduler can set when
 * a ticket's `dueDate` has passed.
 *
 * Internal fields (`version`, `createdAt`, `updatedAt`, `deletedAt`)
 * and navigation properties are excluded from serialised API responses
 * via `@Exclude()` to match the README contract.
 */
@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 255 })
  title!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'enum', enum: TicketStatus })
  status!: TicketStatus;

  @Column({ type: 'enum', enum: TicketPriority })
  priority!: TicketPriority;

  @Column({ type: 'enum', enum: TicketType })
  type!: TicketType;

  @Column()
  projectId!: number;

  @ManyToOne(() => Project, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'projectId' })
  @Exclude()
  project!: Project;

  @Column({ nullable: true, type: 'int' })
  assigneeId!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigneeId' })
  @Exclude()
  assignee!: User | null;

  @Column({ nullable: true, type: 'timestamptz' })
  dueDate!: Date | null;

  /** Set by the auto-escalation scheduler when the ticket is past due at CRITICAL priority. */
  @Column({ default: false })
  isOverdue!: boolean;

  /**
   * Other tickets that block this ticket from progressing to DONE.
   * A ticket cannot transition to DONE while any blocker's status is not DONE.
   */
  @ManyToMany(() => Ticket)
  @JoinTable({
    name: 'ticket_dependencies',
    joinColumn: { name: 'ticketId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'blockedById', referencedColumnName: 'id' },
  })
  @Exclude()
  blockedBy!: Ticket[];

  /** Optimistic lock version — prevents simultaneous edits (TDP 2.4). */
  @VersionColumn()
  @Exclude()
  version!: number;

  @CreateDateColumn()
  @Exclude()
  createdAt!: Date;

  @UpdateDateColumn()
  @Exclude()
  updatedAt!: Date;

  @DeleteDateColumn()
  @Exclude()
  deletedAt!: Date | null;
}

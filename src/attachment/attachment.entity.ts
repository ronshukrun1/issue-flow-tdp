import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Ticket } from '../ticket/ticket.entity';

/**
 * Stores metadata for a file attached to a ticket.
 *
 * File content is not persisted in the database; only the
 * filename, MIME type, and byte size are recorded.
 *
 * Internal fields (`size`, `createdAt`) and navigation properties
 * are excluded from serialised API responses via `@Exclude()` to
 * match the README contract.
 */
@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  ticketId!: number;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  @Exclude()
  ticket!: Ticket;

  @Column()
  filename!: string;

  @Column()
  contentType!: string;

  /** File size in bytes. Excluded from API responses. */
  @Column()
  @Exclude()
  size!: number;

  @CreateDateColumn()
  @Exclude()
  createdAt!: Date;
}

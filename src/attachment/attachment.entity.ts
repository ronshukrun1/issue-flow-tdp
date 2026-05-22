import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Ticket } from '../ticket/ticket.entity';

/**
 * Stores metadata for a file attached to a ticket.
 *
 * File content is not persisted in the database; only the
 * filename, MIME type, and byte size are recorded.
 */
@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  ticketId!: number;

  @ManyToOne(() => Ticket, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ticketId' })
  ticket!: Ticket;

  @Column()
  filename!: string;

  @Column()
  contentType!: string;

  /** File size in bytes. */
  @Column()
  size!: number;

  @CreateDateColumn()
  createdAt!: Date;
}

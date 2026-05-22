import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { AuditAction } from './enums/audit-action.enum';

/**
 * Append-only record of every state-changing action in the system.
 *
 * User-initiated mutations store the actor's `userId` in `performedBy`;
 * automated actions (escalation, auto-assignment) set `actor` to
 * `'SYSTEM'` and leave `performedBy` null.
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'enum', enum: AuditAction })
  action!: AuditAction;

  @Column()
  entityType!: string;

  @Column()
  entityId!: number;

  @Column({ nullable: true, type: 'int' })
  performedBy!: number | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'performedBy' })
  performer!: User | null;

  @Column()
  actor!: string;

  @CreateDateColumn()
  timestamp!: Date;
}

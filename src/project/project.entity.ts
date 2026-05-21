import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

/**
 * Represents a top-level project container that groups related tickets.
 *
 * Projects support soft-delete: the `deletedAt` column is populated
 * instead of removing the row, and TypeORM's global filter hides
 * soft-deleted records from standard queries.
 *
 * The owner relation uses `onDelete: 'RESTRICT'` to prevent
 * accidentally cascading user deletions into project destruction.
 */
@Entity('projects')
export class Project {
  /** Auto-generated unique identifier. */
  @PrimaryGeneratedColumn()
  id!: number;

  /** Human-readable project name. */
  @Column()
  name!: string;

  /** Optional longer description of the project's purpose. */
  @Column({ type: 'text', nullable: true })
  description!: string | null;

  /** Foreign key referencing the user who owns this project. */
  @Column()
  ownerId!: number;

  /** Navigation property to the owning {@link User}. */
  @ManyToOne(() => User, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'ownerId' })
  owner!: User;

  /** Timestamp of when the project was created. */
  @CreateDateColumn()
  createdAt!: Date;

  /** Timestamp of the last update to the project. */
  @UpdateDateColumn()
  updatedAt!: Date;

  /**
   * Soft-delete timestamp. When non-null the record is hidden from
   * standard queries. TypeORM sets this automatically on `softRemove()`
   * or `softDelete()`.
   */
  @DeleteDateColumn()
  deletedAt!: Date | null;
}

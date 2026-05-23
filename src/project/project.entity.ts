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
import { Exclude } from 'class-transformer';
import { User } from '../user/user.entity';

/**
 * Represents a top-level project container that groups related tickets.
 *
 * Projects support soft-delete: the `deletedAt` column is populated
 * instead of removing the row, and TypeORM's global filter hides
 * soft-deleted records from standard queries.
 *
 * Internal fields (`createdAt`, `updatedAt`, `deletedAt`) and
 * navigation properties are excluded from serialised API responses
 * via `@Exclude()` to match the README contract.
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
  @Exclude()
  owner!: User;

  /** Timestamp of when the project was created. Excluded from API responses. */
  @CreateDateColumn()
  @Exclude()
  createdAt!: Date;

  /** Timestamp of the last update to the project. Excluded from API responses. */
  @UpdateDateColumn()
  @Exclude()
  updatedAt!: Date;

  /**
   * Soft-delete timestamp. When non-null the record is hidden from
   * standard queries. Excluded from API responses.
   */
  @DeleteDateColumn()
  @Exclude()
  deletedAt!: Date | null;
}

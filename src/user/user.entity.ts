import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';
import { Role } from './role.enum';

/**
 * Represents a registered user in the IssueFlow platform.
 *
 * Each user acts as the identity behind ticket assignments, comments,
 * and project ownership. The `password`, `createdAt`, and `updatedAt`
 * columns are excluded from serialised API responses via `@Exclude()`.
 * TypeORM still uses `createdAt` internally (e.g. for auto-assignment
 * tie-breaking by registration order).
 */
@Entity('users')
export class User {
  /** Auto-generated unique identifier. */
  @PrimaryGeneratedColumn()
  id!: number;

  /** Login handle — must be unique across the platform. */
  @Column({ unique: true })
  username!: string;

  /** Contact email — must be unique across the platform. */
  @Column({ unique: true })
  email!: string;

  /** Human-readable display name. */
  @Column()
  fullName!: string;

  /**
   * Bcrypt-hashed password.
   * `select: false` ensures this column is never loaded unless explicitly
   * requested via `addSelect`. `@Exclude()` provides a second safety net
   * when `ClassSerializerInterceptor` is active.
   */
  @Column({ select: false })
  @Exclude()
  password!: string;

  /**
   * Authorisation role that determines the user's permissions.
   * Stored as a plain string in the database for readability.
   */
  @Column({ type: 'enum', enum: Role })
  role!: Role;

  /** Timestamp of when the user record was created. Excluded from API responses. */
  @CreateDateColumn()
  @Exclude()
  createdAt!: Date;

  /** Timestamp of the last update to the user record. Excluded from API responses. */
  @UpdateDateColumn()
  @Exclude()
  updatedAt!: Date;
}

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
 * and project ownership. The `password` column is excluded from default
 * query results and serialised responses to prevent accidental leakage.
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

  /** Timestamp of when the user record was created. */
  @CreateDateColumn()
  createdAt!: Date;

  /** Timestamp of the last update to the user record. */
  @UpdateDateColumn()
  updatedAt!: Date;
}

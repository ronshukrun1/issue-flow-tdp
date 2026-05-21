import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

/** Shape of the PostgreSQL driver error embedded inside QueryFailedError. */
interface PostgresDriverError {
  code: string;
}

/**
 * Type guard that checks whether a caught error is a TypeORM
 * `QueryFailedError` wrapping a PostgreSQL driver error with a
 * specific error code.
 */
function isQueryFailedWithCode(
  error: unknown,
  code: string,
): error is QueryFailedError {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as PostgresDriverError)?.code === code
  );
}

/**
 * Encapsulates all business logic for user management.
 *
 * Delegates persistence to TypeORM's {@link Repository} and translates
 * database-level errors (e.g. unique-constraint violations) into
 * meaningful HTTP exceptions.
 */
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Retrieves every user record in the system.
   *
   * @returns An array of all {@link User} entities.
   */
  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  /**
   * Retrieves a single user by their primary key.
   *
   * @param id - The numeric user identifier.
   * @returns The matching {@link User} entity.
   * @throws {NotFoundException} When no user with the given ID exists.
   */
  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOneBy({ id });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  /**
   * Creates and persists a new user.
   *
   * @param dto - Validated creation payload.
   * @returns The newly persisted {@link User} entity (including its generated ID).
   * @throws {ConflictException} When the username or email already exists (HTTP 409).
   */
  async create(dto: CreateUserDto): Promise<User> {
    try {
      const user = this.userRepository.create(dto);
      return await this.userRepository.save(user);
    } catch (error: unknown) {
      if (isQueryFailedWithCode(error, '23505')) {
        throw new ConflictException(
          'A user with this username or email already exists',
        );
      }
      throw error;
    }
  }

  /**
   * Updates the mutable fields of an existing user.
   *
   * Only `fullName` and `role` may be changed; the identity fields
   * (`username`, `email`) are immutable after creation. Uses explicit
   * field assignment to avoid accidentally overwriting protected columns.
   *
   * @param id  - The numeric user identifier.
   * @param dto - Validated update payload (partial).
   * @returns The updated {@link User} entity.
   * @throws {NotFoundException} When no user with the given ID exists.
   */
  async update(id: number, dto: UpdateUserDto): Promise<User> {
    const user = await this.findOne(id);

    if (dto.fullName !== undefined) {
      user.fullName = dto.fullName;
    }
    if (dto.role !== undefined) {
      user.role = dto.role;
    }

    return this.userRepository.save(user);
  }

  /**
   * Permanently removes a user from the system.
   *
   * @param id - The numeric user identifier.
   * @throws {NotFoundException} When no user with the given ID exists.
   */
  async remove(id: number): Promise<void> {
    const user = await this.findOne(id);
    await this.userRepository.remove(user);
  }
}

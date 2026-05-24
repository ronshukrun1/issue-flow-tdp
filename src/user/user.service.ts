import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError, In } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from './role.enum';

/** Shape of the PostgreSQL driver error embedded inside QueryFailedError. */
interface PostgresDriverError {
  code: string;
}

/** Number of salt rounds used by bcrypt when hashing passwords. */
const BCRYPT_SALT_ROUNDS = 10;

/** Bootstrap password used only for the seeded `admin` account (first login). */
const SEEDED_ADMIN_PASSWORD = 'secret';

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
 * Implements {@link OnModuleInit} to seed an initial **`admin`** account
 * when the users table is empty, so operators can authenticate and invoke
 * admin-only routes (including `POST /users`) with a JWT.
 */
@Injectable()
export class UserService implements OnModuleInit {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Seeds an initial administrator when the users table is empty.
   * Runs automatically on application startup.
   */
  async onModuleInit(): Promise<void> {
    const count = await this.userRepository.count();
    if (count > 0) return;

    const hashedPassword = await bcrypt.hash(SEEDED_ADMIN_PASSWORD, BCRYPT_SALT_ROUNDS);
    const admin = this.userRepository.create({
      username: 'admin',
      email: 'admin@issueflow.com',
      fullName: 'System Admin',
      role: Role.ADMIN,
      password: hashedPassword,
    });
    await this.userRepository.save(admin);
    this.logger.log('Seeded initial admin account (username: admin)');
  }

  /**
   * Retrieves every user record in the system.
   *
   * @returns An array of all {@link User} entities (password excluded).
   */
  async findAll(): Promise<User[]> {
    return this.userRepository.find();
  }

  /**
   * Retrieves a single user by their primary key.
   *
   * @param id - The numeric user identifier.
   * @returns The matching {@link User} entity (password excluded).
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
   * Retrieves a user by username **including** the password hash.
   *
   * This method is intended exclusively for the authentication layer
   * and should never be exposed through a controller directly.
   *
   * @param username - The login handle to look up.
   * @returns The matching {@link User} with password, or `null`.
   */
  async findByUsernameWithPassword(username: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.username = :username', { username })
      .getOne();
  }

  /**
   * Retrieves users whose usernames match any of the supplied values.
   *
   * Used by the comment/mention subsystem to resolve `@username`
   * tokens in bulk. Comparison is case-insensitive because usernames
   * are lowercased at the query level.
   *
   * @param usernames - Lowercased username strings to look up.
   * @returns An array of matching {@link User} entities (may be fewer than input if some don't exist).
   */
  async findByUsernames(usernames: string[]): Promise<User[]> {
    if (usernames.length === 0) return [];
    return this.userRepository
      .createQueryBuilder('user')
      .where('LOWER(user.username) IN (:...usernames)', { usernames })
      .getMany();
  }

  /**
   * Creates and persists a new user after bcrypt-hashing **`dto.password`**.
   *
   * Callers **must** supply a plaintext password (`CreateUserDto` validation).
   * The hash is never returned in the HTTP response (`password` column is excluded).
   *
   * @param dto - Validated creation payload (includes **`password`**).
   * @returns The newly persisted {@link User} entity (password excluded from response).
   * @throws {ConflictException} When the username or email already exists (HTTP 409).
   */
  async create(dto: CreateUserDto): Promise<User> {
    try {
      const hashedPassword = await bcrypt.hash(
        dto.password,
        BCRYPT_SALT_ROUNDS,
      );
      const user = this.userRepository.create({
        ...dto,
        password: hashedPassword,
      });
      const saved = await this.userRepository.save(user);

      return this.userRepository.findOneByOrFail({ id: saved.id });
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

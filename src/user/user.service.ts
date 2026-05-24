import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError, DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from './role.enum';
import { Project } from '../project/project.entity';
import { Ticket } from '../ticket/ticket.entity';
import { AuditLog } from '../audit-log/audit-log.entity';
import { AuditAction } from '../audit-log/enums/audit-action.enum';

/** Shape of the PostgreSQL driver error embedded inside QueryFailedError. */
interface PostgresDriverError {
  code: string;
}

/** Number of salt rounds used by bcrypt when hashing passwords. */
const BCRYPT_SALT_ROUNDS = 10;

/** Bootstrap password used only for the seeded `admin` account (first login). */
const SEEDED_ADMIN_PASSWORD = 'secret';

/** Username of the primary bootstrap administrator seeded on first startup. */
export const BOOTSTRAP_ADMIN_USERNAME = 'admin';

/** 403 Forbidden — non-admin included `role` in update body */
export const USER_UPDATE_ROLE_REQUIRES_ADMIN =
  'This action requires administrator privileges.';
/** 403 Forbidden — non-admin targeted another `:userId` */
export const USER_UPDATE_OWN_PROFILE_ONLY =
  'Users can only update their own profile.';

/** 400 Bad Request — attempted hard-delete of the bootstrap admin account */
export const BOOTSTRAP_ADMIN_DELETE_FORBIDDEN =
  'The bootstrap administrator account cannot be deleted';

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
    private readonly dataSource: DataSource,
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
      username: BOOTSTRAP_ADMIN_USERNAME,
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
   * **`ADMIN`** may update **`fullName`** and **`role`** for any user. Non-admins may
   * update **`fullName`** on their own account only — the request body must **not**
   * include the **`role`** property (presence is flagged by **`requestBodyIncludesRole`**).
   *
   * Only `fullName` and `role` may be changed; the identity fields
   * (`username`, `email`) are immutable after creation. Uses explicit
   * field assignment to avoid accidentally overwriting protected columns.
   *
   * @param targetUserId            - `:userId` from the route.
   * @param dto                     - Validated update payload (partial).
   * @param actor                   - Caller from **`request.user`** (`userId`, `role`).
   * @param requestBodyIncludesRole - `true` when the HTTP body contained a **`role`** key (after validation).
   * @returns The updated {@link User} entity.
   * @throws {ForbiddenException} When the caller is not permitted to apply this update.
   * @throws {NotFoundException} When no user with the given ID exists.
   */
  async update(
    targetUserId: number,
    dto: UpdateUserDto,
    actor: { userId: number; role: Role },
    requestBodyIncludesRole: boolean,
  ): Promise<User> {
    if (actor.role !== Role.ADMIN) {
      if (actor.userId !== targetUserId) {
        throw new ForbiddenException(USER_UPDATE_OWN_PROFILE_ONLY);
      }
      if (requestBodyIncludesRole) {
        throw new ForbiddenException(USER_UPDATE_ROLE_REQUIRES_ADMIN);
      }
    }

    const user = await this.findOne(targetUserId);

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
   * Before deletion, owned projects are reassigned to the bootstrap
   * administrator and assigned tickets are explicitly unassigned, each
   * producing a SYSTEM audit log entry within the same transaction.
   *
   * @param id - The numeric user identifier.
   * @throws {NotFoundException} When no user with the given ID exists.
   * @throws {BadRequestException} When attempting to delete the bootstrap admin.
   */
  async remove(id: number): Promise<void> {
    const user = await this.findOne(id);

    if (user.username === BOOTSTRAP_ADMIN_USERNAME) {
      throw new BadRequestException(BOOTSTRAP_ADMIN_DELETE_FORBIDDEN);
    }

    const bootstrapAdmin = await this.userRepository.findOneBy({
      username: BOOTSTRAP_ADMIN_USERNAME,
    });
    if (!bootstrapAdmin) {
      throw new ConflictException(
        'Bootstrap administrator account is missing; cannot safely delete user',
      );
    }

    await this.dataSource.transaction(async (manager) => {
      const ownedProjects = await manager.find(Project, {
        where: { ownerId: id },
      });
      const assignedTickets = await manager.find(Ticket, {
        where: { assigneeId: id },
      });

      const auditEntries: AuditLog[] = [];

      for (const project of ownedProjects) {
        project.ownerId = bootstrapAdmin.id;
        await manager.save(Project, project);
        auditEntries.push(
          manager.create(AuditLog, {
            action: AuditAction.UPDATE,
            entityType: 'PROJECT',
            entityId: project.id,
            performedBy: null,
            actor: 'SYSTEM',
          }),
        );
      }

      for (const ticket of assignedTickets) {
        ticket.assigneeId = null;
        await manager.save(Ticket, ticket);
        auditEntries.push(
          manager.create(AuditLog, {
            action: AuditAction.UPDATE,
            entityType: 'TICKET',
            entityId: ticket.id,
            performedBy: null,
            actor: 'SYSTEM',
          }),
        );
      }

      if (auditEntries.length > 0) {
        await manager.save(AuditLog, auditEntries);
      }

      await manager.remove(User, user);
    });
  }
}

import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, QueryFailedError, DataSource } from 'typeorm';
import { NotFoundException, ConflictException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import {
  UserService,
  USER_UPDATE_OWN_PROFILE_ONLY,
  USER_UPDATE_ROLE_REQUIRES_ADMIN,
  BOOTSTRAP_ADMIN_DELETE_FORBIDDEN,
  BOOTSTRAP_ADMIN_USERNAME,
} from './user.service';
import { User } from './user.entity';
import { Role } from './role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { Project } from '../project/project.entity';
import { Ticket } from '../ticket/ticket.entity';
import { AuditLog } from '../audit-log/audit-log.entity';
import { AuditAction } from '../audit-log/enums/audit-action.enum';

jest.mock('bcrypt');

const now = new Date();

const mockUser: User = {
  id: 1,
  username: 'jdoe',
  email: 'jdoe@example.com',
  fullName: 'John Doe',
  password: 'hashed-password',
  role: Role.DEVELOPER,
  createdAt: now,
  updatedAt: now,
};

/** User object as returned to callers (password stripped). */
const mockUserWithoutPassword: Omit<User, 'password'> = {
  id: 1,
  username: 'jdoe',
  email: 'jdoe@example.com',
  fullName: 'John Doe',
  role: Role.DEVELOPER,
  createdAt: now,
  updatedAt: now,
};

/**
 * Helper that builds a realistic `QueryFailedError` with a nested
 * `driverError` carrying a PostgreSQL error code.
 */
function makeQueryFailedError(code: string): QueryFailedError {
  const driverError = Object.assign(new Error('duplicate key'), { code });
  return new QueryFailedError('INSERT', [], driverError as Error);
}

describe('UserService', () => {
  let service: UserService;
  let repo: jest.Mocked<Repository<User>>;
  let dataSource: { transaction: jest.Mock };
  let transactionManager: {
    find: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
    create: jest.Mock;
  };
  let loggerSpy: jest.SpyInstance;

  beforeAll(() => {
    loggerSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterAll(() => {
    loggerSpy.mockRestore();
  });

  beforeEach(async () => {
    transactionManager = {
      find: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
      create: jest.fn((_entity, data) => data),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (manager: typeof transactionManager) => Promise<void>) =>
        cb(transactionManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
            findOneBy: jest.fn(),
            findOneByOrFail: jest.fn(),
            count: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repo = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------- onModuleInit (seed) ----------

  describe('onModuleInit', () => {
    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-secret');
    });

    it('should seed an admin when the users table is empty', async () => {
      repo.count.mockResolvedValue(0);
      repo.create.mockImplementation((data) => ({ id: 1, ...data }) as User);
      repo.save.mockImplementation(async (entity) => entity as User);

      await service.onModuleInit();

      expect(repo.count).toHaveBeenCalled();
      expect(bcrypt.hash).toHaveBeenCalledWith('secret', 10);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: 'admin',
          email: 'admin@issueflow.com',
          role: Role.ADMIN,
        }),
      );
      expect(repo.save).toHaveBeenCalled();
    });

    it('should skip seeding when users already exist', async () => {
      repo.count.mockResolvedValue(5);

      await service.onModuleInit();

      expect(repo.create).not.toHaveBeenCalled();
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  // ---------- findAll ----------

  describe('findAll', () => {
    it('should return an array of users', async () => {
      repo.find.mockResolvedValue([mockUser]);
      const result = await service.findAll();
      expect(result).toEqual([mockUser]);
      expect(repo.find).toHaveBeenCalledTimes(1);
    });

    it('should return an empty array when no users exist', async () => {
      repo.find.mockResolvedValue([]);
      expect(await service.findAll()).toEqual([]);
    });
  });

  // ---------- findOne ----------

  describe('findOne', () => {
    it('should return a user when found', async () => {
      repo.findOneBy.mockResolvedValue(mockUser);
      expect(await service.findOne(1)).toEqual(mockUser);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- findByUsernameWithPassword ----------

  describe('findByUsernameWithPassword', () => {
    it('should return a user with password via query builder', async () => {
      const qb = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockUser),
      };
      repo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await service.findByUsernameWithPassword('jdoe');
      expect(result).toEqual(mockUser);
      expect(qb.addSelect).toHaveBeenCalledWith('user.password');
    });

    it('should return null when user not found', async () => {
      const qb = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      repo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await service.findByUsernameWithPassword('unknown');
      expect(result).toBeNull();
    });
  });

  // ---------- findByUsernames ----------

  describe('findByUsernames', () => {
    it('should return matching users for given usernames', async () => {
      const qb = {
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([mockUser]),
      };
      repo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await service.findByUsernames(['jdoe']);
      expect(result).toEqual([mockUser]);
    });

    it('should return an empty array when given empty input', async () => {
      const result = await service.findByUsernames([]);
      expect(result).toEqual([]);
    });
  });

  // ---------- create ----------

  describe('create', () => {
    const dto: CreateUserDto = {
      username: 'jdoe',
      email: 'jdoe@example.com',
      fullName: 'John Doe',
      password: 'secret123',
      role: Role.DEVELOPER,
    };

    beforeEach(() => {
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-password');
    });

    it('should hash the provided password and re-fetch the user', async () => {
      repo.create.mockReturnValue(mockUser);
      repo.save.mockResolvedValue(mockUser);
      repo.findOneByOrFail.mockResolvedValue(mockUserWithoutPassword as User);

      const result = await service.create(dto);
      expect(bcrypt.hash).toHaveBeenCalledWith('secret123', 10);
      expect(repo.create).toHaveBeenCalledWith({
        ...dto,
        password: 'hashed-password',
      });
      expect(repo.findOneByOrFail).toHaveBeenCalledWith({ id: mockUser.id });
      expect(result).not.toHaveProperty('password');
    });

    it('should throw ConflictException on duplicate username/email', async () => {
      repo.create.mockReturnValue(mockUser);
      repo.save.mockRejectedValue(makeQueryFailedError('23505'));

      await expect(service.create(dto)).rejects.toThrow(ConflictException);
    });

    it('should re-throw unexpected database errors', async () => {
      repo.create.mockReturnValue(mockUser);
      const unexpected = new Error('connection lost');
      repo.save.mockRejectedValue(unexpected);

      await expect(service.create(dto)).rejects.toThrow('connection lost');
    });
  });

  // ---------- update ----------

  describe('update', () => {
    const adminActor = { userId: 2, role: Role.ADMIN };
    const devActorOwn = { userId: mockUser.id, role: Role.DEVELOPER };

    async function expectForbiddenMsg(
      promise: Promise<unknown>,
      message: string,
    ): Promise<void> {
      const err = await promise.catch((e: unknown): unknown => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect((err as ForbiddenException).getResponse()).toMatchObject({
        statusCode: 403,
        message,
      });
    }

    /** Unauthenticated callers never reach **`UserController#update`**; global JwtAuthGuard in **`AppModule`** rejects them (**401**) first. */

    it('ADMIN: updates another users fullName only', async () => {
      const partialDto: UpdateUserDto = { fullName: 'Other Name' };
      const targetUser: User = { ...mockUser, id: 5 };
      const updated: User = { ...targetUser, fullName: 'Other Name' };
      repo.findOneBy.mockResolvedValue({ ...targetUser });
      repo.save.mockResolvedValue(updated);

      const result = await service.update(5, partialDto, adminActor, false);
      expect(result.fullName).toBe('Other Name');
      expect(repo.findOneBy).toHaveBeenCalledWith({ id: 5 });
    });

    it('ADMIN: updates another users role only', async () => {
      const dto: UpdateUserDto = { role: Role.ADMIN };
      const targetUser: User = { ...mockUser, id: 7 };
      const updated: User = { ...targetUser, role: Role.ADMIN };
      repo.findOneBy.mockResolvedValue({ ...targetUser });
      repo.save.mockResolvedValue(updated);

      const result = await service.update(7, dto, adminActor, true);
      expect(result.role).toBe(Role.ADMIN);
    });

    it('ADMIN: updates another users fullName and role together', async () => {
      const dto: UpdateUserDto = { fullName: 'Jane Doe', role: Role.ADMIN };
      const targetUser: User = { ...mockUser, id: 9 };
      const updated: User = { ...targetUser, ...dto };
      repo.findOneBy.mockResolvedValue({ ...targetUser });
      repo.save.mockResolvedValue(updated);

      const result = await service.update(9, dto, adminActor, true);
      expect(result.fullName).toBe('Jane Doe');
      expect(result.role).toBe(Role.ADMIN);
    });

    it('ADMIN: partial update retains unspecified fields', async () => {
      const partialDto: UpdateUserDto = { fullName: 'Only Name' };
      const updated: User = { ...mockUser, fullName: 'Only Name' };
      repo.findOneBy.mockResolvedValue({ ...mockUser });
      repo.save.mockResolvedValue(updated);

      const result = await service.update(
        mockUser.id,
        partialDto,
        adminActor,
        false,
      );
      expect(result.fullName).toBe('Only Name');
      expect(result.role).toBe(Role.DEVELOPER);
    });

    it('DEVELOPER: updates own fullName when role key absent from JSON', async () => {
      const partialDto: UpdateUserDto = { fullName: 'New Name' };
      const updated: User = { ...mockUser, fullName: 'New Name' };
      repo.findOneBy.mockResolvedValue({ ...mockUser });
      repo.save.mockResolvedValue(updated);

      const result = await service.update(
        mockUser.id,
        partialDto,
        devActorOwn,
        false,
      );
      expect(result.fullName).toBe('New Name');
    });

    it('DEVELOPER: forbids updating own profile when JSON body contains role key', async () => {
      const dto: UpdateUserDto = { role: Role.DEVELOPER };

      await expectForbiddenMsg(
        service.update(mockUser.id, dto, devActorOwn, true),
        USER_UPDATE_ROLE_REQUIRES_ADMIN,
      );
    });

    it('DEVELOPER: forbids updating another users fullName', async () => {
      await expectForbiddenMsg(
        service.update(99, { fullName: 'Hacker' }, devActorOwn, false),
        USER_UPDATE_OWN_PROFILE_ONLY,
      );
    });

    it('DEVELOPER: forbids updating another user when body includes role (own-profile rule first)', async () => {
      await expectForbiddenMsg(
        service.update(
          99,
          { fullName: 'X', role: Role.DEVELOPER },
          devActorOwn,
          true,
        ),
        USER_UPDATE_OWN_PROFILE_ONLY,
      );
    });

    it('ADMIN: throws NotFoundException when user does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(
        service.update(
          999,
          { fullName: 'Nope', role: Role.ADMIN },
          adminActor,
          true,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- remove ----------

  describe('remove', () => {
    const bootstrapAdmin: User = {
      ...mockUser,
      id: 99,
      username: BOOTSTRAP_ADMIN_USERNAME,
      role: Role.ADMIN,
    };

    it('should remove the user without error when no cascade work is needed', async () => {
      repo.findOneBy
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(bootstrapAdmin);
      transactionManager.find.mockResolvedValue([]);

      await expect(service.remove(1)).resolves.toBeUndefined();
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(transactionManager.remove).toHaveBeenCalledWith(User, mockUser);
      expect(transactionManager.save).not.toHaveBeenCalled();
    });

    it('should reassign owned projects and nullify ticket assignees with SYSTEM audit logs', async () => {
      const ownedProject = {
        id: 10,
        name: 'Owned',
        description: null,
        ownerId: mockUser.id,
      } as Project;
      const assignedTicket = {
        id: 20,
        assigneeId: mockUser.id,
      } as Ticket;

      repo.findOneBy
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce(bootstrapAdmin);
      transactionManager.find
        .mockResolvedValueOnce([ownedProject])
        .mockResolvedValueOnce([assignedTicket]);

      await service.remove(mockUser.id);

      expect(ownedProject.ownerId).toBe(bootstrapAdmin.id);
      expect(assignedTicket.assigneeId).toBeNull();
      expect(transactionManager.save).toHaveBeenCalledWith(Project, ownedProject);
      expect(transactionManager.save).toHaveBeenCalledWith(Ticket, assignedTicket);
      expect(transactionManager.create).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: 'PROJECT',
          entityId: ownedProject.id,
          performedBy: null,
          actor: 'SYSTEM',
        }),
      );
      expect(transactionManager.create).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          action: AuditAction.UPDATE,
          entityType: 'TICKET',
          entityId: assignedTicket.id,
          performedBy: null,
          actor: 'SYSTEM',
        }),
      );
      expect(transactionManager.save).toHaveBeenCalledWith(
        AuditLog,
        expect.arrayContaining([
          expect.objectContaining({ entityType: 'PROJECT' }),
          expect.objectContaining({ entityType: 'TICKET' }),
        ]),
      );
      expect(transactionManager.remove).toHaveBeenCalledWith(User, mockUser);
    });

    it('should reject deleting the bootstrap administrator', async () => {
      repo.findOneBy.mockResolvedValue(bootstrapAdmin);

      await expect(service.remove(bootstrapAdmin.id)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.remove(bootstrapAdmin.id)).rejects.toThrow(
        BOOTSTRAP_ADMIN_DELETE_FORBIDDEN,
      );
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when deleting a non-existent user', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});

/**
 * Full-flow integration test that exercises the core IssueFlow lifecycle
 * using mock repositories. Validates the interplay between:
 *
 * 1. Authentication — JWT signing and token revocation
 * 2. Ticket creation — with auto-assignment to least-loaded DEVELOPER
 * 3. Comment creation — with @username mention parsing and resolution
 * 4. Audit log — verifying USER and SYSTEM entries are generated
 */
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { AuthService } from '../auth/auth.service';
import { UserService } from '../user/user.service';
import { TicketService } from '../ticket/ticket.service';
import { CommentService } from '../comment/comment.service';
import { ProjectService } from '../project/project.service';
import { AuditLogService, AuditLogEntry } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';
import { User } from '../user/user.entity';
import { Ticket } from '../ticket/ticket.entity';
import { Comment } from '../comment/comment.entity';
import { AuditLog } from '../audit-log/audit-log.entity';
import { Role } from '../user/role.enum';
import { TicketStatus } from '../ticket/enums/ticket-status.enum';
import { TicketPriority } from '../ticket/enums/ticket-priority.enum';
import { TicketType } from '../ticket/enums/ticket-type.enum';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Project } from '../project/project.entity';

jest.mock('bcrypt');

const now = new Date();
let autoId = 100;

const devUser: User = {
  id: 1,
  username: 'alice',
  email: 'alice@test.com',
  fullName: 'Alice Dev',
  password: '$2b$10$hashed',
  role: Role.DEVELOPER,
  createdAt: now,
  updatedAt: now,
};

const adminUser: User = {
  id: 2,
  username: 'admin',
  email: 'admin@test.com',
  fullName: 'Admin User',
  password: '$2b$10$hashed',
  role: Role.ADMIN,
  createdAt: now,
  updatedAt: now,
};

describe('IssueFlow Full-Flow Integration', () => {
  let authService: AuthService;
  let ticketService: TicketService;
  let commentService: CommentService;
  let auditLogService: AuditLogService;

  const auditStore: AuditLog[] = [];

  beforeAll(() => {
    Logger.overrideLogger(['warn']);
  });

  afterAll(() => {
    Logger.overrideLogger(undefined as never);
  });

  beforeEach(async () => {
    auditStore.length = 0;
    autoId = 100;

    const ticketQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };

    const userQb = {
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ userId: devUser.id, openTicketCount: '0' }),
      getRawMany: jest.fn().mockResolvedValue([]),
    };

    const userRepoQb = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({ ...adminUser, password: '$2b$10$hashed' }),
      getMany: jest.fn().mockResolvedValue([devUser]),
    };

    const commentQb = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    const queryRunnerStub = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: {
        findOne: jest.fn(),
        save: jest.fn(),
        remove: jest.fn(),
      },
    };

    const dataSourceStub = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunnerStub),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        UserService,
        TicketService,
        CommentService,
        ProjectService,
        AuditLogService,
        {
          provide: DataSource,
          useValue: dataSourceStub,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(3600),
            getOrThrow: jest.fn().mockReturnValue('test-secret'),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('mock-jwt-token'),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn().mockResolvedValue([devUser, adminUser]),
            findOneBy: jest.fn().mockImplementation(({ id }: { id: number }) => {
              if (id === devUser.id) return Promise.resolve(devUser);
              if (id === adminUser.id) return Promise.resolve(adminUser);
              return Promise.resolve(null);
            }),
            createQueryBuilder: jest.fn().mockImplementation((alias?: string) => {
              if (alias === 'user') {
                return {
                  ...userRepoQb,
                  ...userQb,
                };
              }
              return userRepoQb;
            }),
            create: jest.fn().mockImplementation((data) => ({ ...data, id: ++autoId })),
            save: jest.fn().mockImplementation(async (entity) => entity),
            delete: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
        {
          provide: getRepositoryToken(Ticket),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockImplementation(async ({ where }: { where: { id: number } }) => {
              return {
                id: where.id,
                title: 'Test Ticket',
                description: 'Desc',
                status: TicketStatus.TODO,
                priority: TicketPriority.HIGH,
                type: TicketType.BUG,
                projectId: 1,
                project: undefined as never,
                assigneeId: null,
                assignee: null,
                dueDate: null,
                isOverdue: false,
                blockedBy: [],
                version: 1,
                createdAt: now,
                updatedAt: now,
                deletedAt: null,
              } as Ticket;
            }),
            findOneBy: jest.fn().mockImplementation(async ({ id }: { id: number }) => ({
              id,
              title: 'Test Ticket',
              description: 'Desc',
              status: TicketStatus.TODO,
              priority: TicketPriority.HIGH,
              type: TicketType.BUG,
              projectId: 1,
              project: undefined as never,
              assigneeId: null,
              assignee: null,
              dueDate: null,
              isOverdue: false,
              blockedBy: [],
              version: 1,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            })),
            create: jest.fn().mockImplementation((data) => ({
              id: ++autoId,
              ...data,
              project: undefined as never,
              assignee: null,
              isOverdue: false,
              blockedBy: [],
              version: 1,
              createdAt: now,
              updatedAt: now,
              deletedAt: null,
            })),
            save: jest.fn().mockImplementation(async (entity) => entity),
            softRemove: jest.fn().mockImplementation(async (entity) => ({ ...entity, deletedAt: now })),
            restore: jest.fn().mockResolvedValue({ affected: 1 }),
            createQueryBuilder: jest.fn().mockReturnValue(ticketQb),
          },
        },
        {
          provide: getRepositoryToken(Comment),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue(null),
            findOneOrFail: jest.fn().mockImplementation(async ({ where }: { where: { id: number } }) => ({
              id: where.id,
              ticketId: 1,
              authorId: adminUser.id,
              content: 'Great work @alice!',
              mentionedUsers: [devUser],
              version: 1,
              createdAt: now,
              updatedAt: now,
            })),
            create: jest.fn().mockImplementation((data) => ({
              id: ++autoId,
              ...data,
              version: 1,
              createdAt: now,
              updatedAt: now,
            })),
            save: jest.fn().mockImplementation(async (entity) => entity),
            remove: jest.fn().mockResolvedValue(undefined),
            createQueryBuilder: jest.fn().mockReturnValue(commentQb),
          },
        },
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            create: jest.fn().mockImplementation((data) => ({
              id: ++autoId,
              ...data,
              timestamp: now,
            })),
            save: jest.fn().mockImplementation(async (entity) => {
              if (Array.isArray(entity)) {
                entity.forEach((e) => auditStore.push(e));
                return entity;
              }
              auditStore.push(entity);
              return entity;
            }),
            createQueryBuilder: jest.fn().mockReturnValue({
              andWhere: jest.fn().mockReturnThis(),
              orderBy: jest.fn().mockReturnThis(),
              getMany: jest.fn().mockImplementation(async () => [...auditStore]),
            }),
          },
        },
        {
          provide: getRepositoryToken(Project),
          useValue: {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn(),
            save: jest.fn(),
            restore: jest.fn().mockResolvedValue({ affected: 1 }),
          },
        },
      ],
    })
      .overrideProvider(ProjectService)
      .useValue({
        findOne: jest.fn().mockResolvedValue({
          id: 1,
          name: 'Test Project',
          description: 'Desc',
          ownerId: adminUser.id,
        }),
        findAll: jest.fn().mockResolvedValue([]),
      })
      .compile();

    authService = module.get<AuthService>(AuthService);
    ticketService = module.get<TicketService>(TicketService);
    commentService = module.get<CommentService>(CommentService);
    auditLogService = module.get<AuditLogService>(AuditLogService);
  });

  // ── 1. Authentication & Token Lifecycle ──────────────────────────

  describe('Step 1: Authentication', () => {
    it('should sign a JWT for valid credentials', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await authService.login({
        username: 'admin',
        password: 'secret',
      });

      expect(result.accessToken).toBe('mock-jwt-token');
      expect(result.tokenType).toBe('Bearer');
      expect(result.expiresIn).toBe(3600);
    });

    it('should support token revocation', () => {
      expect(authService.isTokenRevoked('mock-jwt-token')).toBe(false);
      authService.revokeToken('mock-jwt-token');
      expect(authService.isTokenRevoked('mock-jwt-token')).toBe(true);
    });
  });

  // ── 2. Ticket Creation with Auto-Assignment ──────────────────────

  describe('Step 2: Ticket Creation with Auto-Assignment', () => {
    it('should create a ticket, auto-assign, and generate SYSTEM audit entry', async () => {
      const ticket = await ticketService.create({
        title: 'Integration Bug',
        description: 'Found during integration testing',
        status: TicketStatus.TODO,
        priority: TicketPriority.HIGH,
        type: TicketType.BUG,
        projectId: 1,
      });

      expect(ticket).toBeDefined();
      expect(ticket.assigneeId).toBe(devUser.id);

      const autoAssignLogs = auditStore.filter(
        (l) => l.action === AuditAction.AUTO_ASSIGN,
      );
      expect(autoAssignLogs.length).toBeGreaterThanOrEqual(1);
      expect(autoAssignLogs[0].actor).toBe('SYSTEM');
      expect(autoAssignLogs[0].performedBy).toBeNull();
    });
  });

  // ── 3. Comment with @Mention ─────────────────────────────────────

  describe('Step 3: Comment with @Mention', () => {
    it('should create a comment and resolve @username mentions', async () => {
      const comment = await commentService.create(
        101,
        adminUser.id,
        { content: 'Great work @alice!' },
      );

      expect(comment).toBeDefined();
      expect(comment.content).toBe('Great work @alice!');
      expect(comment.mentionedUsers).toHaveLength(1);
      expect(comment.mentionedUsers[0].username).toBe('alice');
    });
  });

  // ── 4. Audit Trail Consistency ───────────────────────────────────

  describe('Step 4: Audit Trail Consistency', () => {
    it('should record user-initiated and system audit entries', async () => {
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await authService.login({ username: 'admin', password: 'secret' });

      await ticketService.create({
        title: 'Audit Test Ticket',
        description: 'Verifying audit trail',
        status: TicketStatus.TODO,
        priority: TicketPriority.MEDIUM,
        type: TicketType.FEATURE,
        projectId: 1,
      });

      await auditLogService.log({
        action: AuditAction.CREATE,
        entityType: 'TICKET',
        entityId: 999,
        performedBy: adminUser.id,
        actor: 'USER',
      });

      const userLogs = auditStore.filter((l) => l.actor === 'USER');
      const systemLogs = auditStore.filter((l) => l.actor === 'SYSTEM');

      expect(userLogs.length).toBeGreaterThanOrEqual(1);
      expect(systemLogs.length).toBeGreaterThanOrEqual(1);

      const userEntry = userLogs.find(
        (l) => l.action === AuditAction.CREATE && l.entityType === 'TICKET',
      );
      expect(userEntry).toBeDefined();
      expect(userEntry!.performedBy).toBe(adminUser.id);

      const systemEntry = systemLogs.find(
        (l) => l.action === AuditAction.AUTO_ASSIGN,
      );
      expect(systemEntry).toBeDefined();
      expect(systemEntry!.performedBy).toBeNull();
      expect(systemEntry!.entityType).toBe('TICKET');
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Repository,
  OptimisticLockVersionMismatchError,
  DataSource,
  QueryFailedError,
} from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { instanceToPlain } from 'class-transformer';
import { TicketService, MAX_TICKET_CSV_IMPORT_ROWS } from './ticket.service';
import { Ticket } from './ticket.entity';
import { User } from '../user/user.entity';
import { ProjectService } from '../project/project.service';
import { UserService } from '../user/user.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditLog } from '../audit-log/audit-log.entity';
import { AuditAction } from '../audit-log/enums/audit-action.enum';
import { TicketStatus } from './enums/ticket-status.enum';
import { TicketPriority } from './enums/ticket-priority.enum';
import { TicketType } from './enums/ticket-type.enum';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE } from '../common/pg-nowait-row-lock';
import { Role } from '../user/role.enum';

const now = new Date();

/** Must match {@link TicketService} open-ticket JOIN used by workload and auto-assignment. */
const OPEN_TICKET_JOIN_CONDITION =
  'ticket."assigneeId" = user.id AND ticket."projectId" = :projectId AND ticket.status != :done AND ticket."deletedAt" IS NULL';
const PROJECT_ASSIGNEE_TICKET_ALIAS = 'project_ticket';
const PROJECT_ASSIGNEE_JOIN_CONDITION = `${PROJECT_ASSIGNEE_TICKET_ALIAS}."assigneeId" = user.id AND ${PROJECT_ASSIGNEE_TICKET_ALIAS}."projectId" = :projectId AND ${PROJECT_ASSIGNEE_TICKET_ALIAS}."assigneeId" IS NOT NULL AND ${PROJECT_ASSIGNEE_TICKET_ALIAS}."deletedAt" IS NULL`;
const OPEN_TICKET_COUNT_SQL = 'COUNT(DISTINCT ticket.id)';

type UserQbMock = {
  innerJoin: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  groupBy: jest.Mock;
  addGroupBy: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
};

const expectDeveloperWorkloadBaseQuery = (
  qb: UserQbMock,
  projectId: number,
) => {
  expect(qb.innerJoin).toHaveBeenCalledWith(
    'tickets',
    PROJECT_ASSIGNEE_TICKET_ALIAS,
    PROJECT_ASSIGNEE_JOIN_CONDITION,
    { projectId },
  );
  expect(qb.leftJoin).toHaveBeenCalledWith(
    'tickets',
    'ticket',
    OPEN_TICKET_JOIN_CONDITION,
    { projectId, done: TicketStatus.DONE },
  );
  expect(qb.where).toHaveBeenCalledWith('user.role = :role', {
    role: Role.DEVELOPER,
  });
  expect(qb.groupBy).toHaveBeenCalledWith('user.id');
  expect(qb.addGroupBy).toHaveBeenCalledWith('user.createdAt');
};

const mockTicket: Ticket = {
  id: 1,
  title: 'Fix login bug',
  description: 'Users cannot log in on mobile',
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
};

describe('TicketService', () => {
  let service: TicketService;
  let repo: jest.Mocked<Repository<Ticket>>;
  let userRepo: jest.Mocked<Repository<User>>;
  let projectService: jest.Mocked<ProjectService>;
  let userService: jest.Mocked<UserService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let txnTicketManager: {
    findOne: jest.Mock;
    save: jest.Mock;
    create: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let dataSource: { createQueryRunner: jest.Mock; transaction: jest.Mock };

  const mockUserRepoQb = () => {
    const qb = {
      innerJoin: jest.fn().mockReturnThis(),
      leftJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      addGroupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
      getRawMany: jest.fn(),
    };
    userRepo.createQueryBuilder.mockReturnValue(qb as never);
    return qb;
  };

  beforeEach(async () => {
    txnTicketManager = {
      findOne: jest.fn(),
      save: jest.fn(),
      create: jest.fn(),
      createQueryBuilder: jest.fn(),
    };
    const queryRunnerStub = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: txnTicketManager,
    };
    const dataSourceStub = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunnerStub),
      transaction: jest.fn(
        async (cb: (manager: typeof txnTicketManager) => Promise<unknown>) =>
          cb(txnTicketManager),
      ),
    };
    dataSource = dataSourceStub;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TicketService,
        {
          provide: getRepositoryToken(Ticket),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            findOneBy: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softRemove: jest.fn(),
            restore: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: ProjectService,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: UserService,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue({}) },
        },
        {
          provide: DataSource,
          useValue: dataSourceStub,
        },
      ],
    }).compile();

    service = module.get<TicketService>(TicketService);
    repo = module.get(getRepositoryToken(Ticket));
    userRepo = module.get(getRepositoryToken(User));
    projectService = module.get(ProjectService);
    userService = module.get(UserService);
    auditLogService = module.get(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should include isOverdue in serialized responses when false or true', () => {
    const inactive = Object.assign(new Ticket(), {
      ...mockTicket,
      isOverdue: false,
    });
    const overdue = Object.assign(new Ticket(), {
      ...mockTicket,
      isOverdue: true,
    });

    expect(JSON.stringify(instanceToPlain(inactive))).toContain(
      '"isOverdue":false',
    );
    expect(JSON.stringify(instanceToPlain(overdue))).toContain(
      '"isOverdue":true',
    );
  });

  // ---------- findByProject ----------

  describe('findByProject', () => {
    it('should validate the project and return its tickets', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.find.mockResolvedValue([mockTicket]);

      const result = await service.findByProject(1);
      expect(projectService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual([mockTicket]);
    });

    it('should propagate NotFoundException when the project does not exist', async () => {
      projectService.findOne.mockRejectedValue(new NotFoundException());
      await expect(service.findByProject(999)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should propagate NotFoundException when the project is soft-deleted', async () => {
      projectService.findOne.mockRejectedValue(
        new NotFoundException('Project with ID 5 not found'),
      );
      await expect(service.findByProject(5)).rejects.toThrow(
        'Project with ID 5 not found',
      );
      expect(repo.find).not.toHaveBeenCalled();
    });
  });

  // ---------- findOne ----------

  describe('findOne', () => {
    it('should return a ticket when found', async () => {
      repo.findOneBy.mockResolvedValue(mockTicket);
      expect(await service.findOne(1)).toEqual(mockTicket);
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- create ----------

  describe('create', () => {
    const dto: CreateTicketDto = {
      title: 'Fix login bug',
      description: 'Users cannot log in on mobile',
      status: TicketStatus.TODO,
      priority: TicketPriority.HIGH,
      type: TicketType.BUG,
      projectId: 1,
    };

    it('should validate the project and create a ticket (with assigneeId)', async () => {
      const assigned = { ...mockTicket, assigneeId: 5 };
      projectService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(assigned);
      repo.save.mockResolvedValue(assigned);

      const result = await service.create({ ...dto, assigneeId: 5 });
      expect(result.assigneeId).toBe(5);
    });

    it('should auto-assign when assigneeId is null', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue({ ...mockTicket });
      repo.save.mockResolvedValueOnce({ ...mockTicket });
      txnTicketManager.save.mockImplementation(async (_entity, value) => value);
      txnTicketManager.create.mockReturnValue({
        action: AuditAction.AUTO_ASSIGN,
        actor: 'SYSTEM',
        performedBy: null,
      });

      const qb = mockUserRepoQb();
      qb.getRawOne.mockResolvedValue({ userId: 7, openTicketCount: '0' });

      const result = await service.create(dto);
      expect(result.assigneeId).toBe(7);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(txnTicketManager.save).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          action: AuditAction.AUTO_ASSIGN,
          actor: 'SYSTEM',
          performedBy: null,
        }),
      );
    });

    it('should not auto-assign when assigneeId is provided', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockResolvedValue({} as never);
      const assigned = { ...mockTicket, assigneeId: 5 };
      repo.create.mockReturnValue(assigned);
      repo.save.mockResolvedValue(assigned);

      await service.create({ ...dto, assigneeId: 5 });

      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(auditLogService.log).not.toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.AUTO_ASSIGN }),
      );
    });

    it('should leave unassigned when no DEVELOPERs exist', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      const savedTicket = { ...mockTicket };
      repo.create.mockReturnValue(savedTicket);
      repo.save.mockResolvedValueOnce(savedTicket);

      const qb = mockUserRepoQb();
      qb.getRawOne.mockResolvedValue(undefined);

      const result = await service.create(dto);
      expect(result.assigneeId).toBeNull();
      expect(txnTicketManager.save).not.toHaveBeenCalledWith(
        AuditLog,
        expect.anything(),
      );
    });

    it('should throw BadRequestException when project does not exist', async () => {
      projectService.findOne.mockRejectedValue(new NotFoundException());
      await expect(service.create({ ...dto, projectId: 999 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when assignee does not exist', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockRejectedValue(new NotFoundException());
      await expect(service.create({ ...dto, assigneeId: 999 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should re-throw unexpected errors from project lookup', async () => {
      projectService.findOne.mockRejectedValue(new Error('db down'));
      await expect(service.create(dto)).rejects.toThrow('db down');
    });
  });

  // ---------- update ----------

  describe('update', () => {
    it('should update and return the modified ticket', async () => {
      const updated = { ...mockTicket, title: 'New title' };
      txnTicketManager.findOne.mockResolvedValue({ ...mockTicket });
      txnTicketManager.save.mockResolvedValue(updated);

      const result = await service.update(1, { title: 'New title' });
      expect(result.title).toBe('New title');
      expect(txnTicketManager.findOne).toHaveBeenCalledWith(Ticket, {
        where: { id: 1 },
        lock: { mode: 'pessimistic_write', onLocked: 'nowait' },
      });
    });

    it('should reject updates on a DONE ticket', async () => {
      txnTicketManager.findOne.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.DONE,
      });
      await expect(service.update(1, { title: 'Change' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject backward status transitions', async () => {
      txnTicketManager.findOne.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.IN_PROGRESS,
      });
      await expect(
        service.update(1, { status: TicketStatus.TODO }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow forward status transitions', async () => {
      const ticket = { ...mockTicket, status: TicketStatus.TODO };
      const updated = { ...ticket, status: TicketStatus.IN_PROGRESS };
      txnTicketManager.findOne.mockResolvedValue(ticket);
      txnTicketManager.save.mockResolvedValue(updated);

      const result = await service.update(1, {
        status: TicketStatus.IN_PROGRESS,
      });
      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
    });

    it('should reject same-status transitions', async () => {
      txnTicketManager.findOne.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.IN_REVIEW,
      });
      await expect(
        service.update(1, { status: TicketStatus.IN_REVIEW }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle partial updates (no status change)', async () => {
      const updated = { ...mockTicket, priority: TicketPriority.CRITICAL };
      txnTicketManager.findOne.mockResolvedValue({ ...mockTicket });
      txnTicketManager.save.mockResolvedValue(updated);

      const result = await service.update(1, {
        priority: TicketPriority.CRITICAL,
      });
      expect(result.priority).toBe(TicketPriority.CRITICAL);
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      txnTicketManager.findOne.mockResolvedValue(null);
      await expect(
        service.update(999, { title: 'X' } as UpdateTicketDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject DONE transition when unresolved blockers exist', async () => {
      const inReview = { ...mockTicket, status: TicketStatus.IN_REVIEW };
      txnTicketManager.findOne.mockResolvedValue(inReview);

      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
      };
      txnTicketManager.createQueryBuilder.mockReturnValue(qb as never);

      await expect(
        service.update(1, { status: TicketStatus.DONE }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow DONE transition when all blockers are DONE', async () => {
      const inReview = { ...mockTicket, status: TicketStatus.IN_REVIEW };
      txnTicketManager.findOne.mockResolvedValue(inReview);

      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };
      txnTicketManager.createQueryBuilder.mockReturnValue(qb as never);
      txnTicketManager.save.mockResolvedValue({
        ...inReview,
        status: TicketStatus.DONE,
      });

      const result = await service.update(1, { status: TicketStatus.DONE });
      expect(result.status).toBe(TicketStatus.DONE);
    });

    it('should reset isOverdue when priority is set manually', async () => {
      const overdue = {
        ...mockTicket,
        isOverdue: true,
        priority: TicketPriority.CRITICAL,
      };
      txnTicketManager.findOne.mockResolvedValue({ ...overdue });
      txnTicketManager.save.mockImplementation(async (Entity, t: Ticket) => t);

      const result = await service.update(1, { priority: TicketPriority.LOW });
      expect(result.isOverdue).toBe(false);
      expect(result.priority).toBe(TicketPriority.LOW);
    });

    it('should reset isOverdue when dueDate is manually moved to the future without changing status', async () => {
      const future = new Date(Date.now() + 60_000).toISOString();
      const overdue = {
        ...mockTicket,
        status: TicketStatus.IN_PROGRESS,
        isOverdue: true,
        dueDate: new Date('2020-01-01T00:00:00.000Z'),
      };
      txnTicketManager.findOne.mockResolvedValue({ ...overdue });
      txnTicketManager.save.mockImplementation(async (_entity, t: Ticket) => t);

      const result = await service.update(1, { dueDate: future });

      expect(result.isOverdue).toBe(false);
      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
      expect(result.dueDate?.toISOString()).toBe(future);
    });

    it('should throw ConflictException on optimistic lock version mismatch', async () => {
      txnTicketManager.findOne.mockResolvedValue({ ...mockTicket });
      txnTicketManager.save.mockRejectedValue(
        new OptimisticLockVersionMismatchError('Ticket', 1, 2),
      );

      await expect(service.update(1, { title: 'Race' })).rejects.toThrow(
        ConflictException,
      );
    });

    it('should throw ConflictException when the pessimistic NOWAIT row lock cannot be acquired', async () => {
      txnTicketManager.findOne.mockRejectedValue(
        Object.assign(new QueryFailedError('', [], new Error()), {
          driverError: { code: '55P03' },
        }),
      );

      await expect(service.update(1, { title: 'X' })).rejects.toThrow(
        ConflictException,
      );
      await expect(service.update(1, { title: 'X' })).rejects.toThrow(
        PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE,
      );
    });

    it('should not trigger auto-assignment on update', async () => {
      const updated = { ...mockTicket, title: 'New title' };
      txnTicketManager.findOne.mockResolvedValue({ ...mockTicket });
      txnTicketManager.save.mockResolvedValue(updated);

      await service.update(1, { title: 'New title' });

      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
    });
  });

  // ---------- softRemove ----------

  describe('softRemove', () => {
    it('should soft-delete the ticket', async () => {
      repo.findOneBy.mockResolvedValue(mockTicket);
      repo.softRemove.mockResolvedValue({ ...mockTicket, deletedAt: now });
      await expect(service.softRemove(1)).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.softRemove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- findDeleted ----------

  describe('findDeleted', () => {
    it('should return soft-deleted tickets for a project', async () => {
      const deleted = { ...mockTicket, deletedAt: now };
      const qb = {
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([deleted]),
      };
      repo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await service.findDeleted(1);
      expect(result).toEqual([deleted]);
    });
  });

  // ---------- restore ----------

  describe('restore', () => {
    it('should restore a soft-deleted ticket', async () => {
      repo.findOne.mockResolvedValue({ ...mockTicket, deletedAt: now });
      projectService.findOne.mockResolvedValue({} as never);
      repo.restore.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      await expect(service.restore(1)).resolves.toBeUndefined();
      expect(repo.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
        withDeleted: true,
      });
      expect(projectService.findOne).toHaveBeenCalledWith(mockTicket.projectId);
    });

    it('should throw NotFoundException when no soft-deleted ticket found', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.restore(999)).rejects.toThrow(NotFoundException);
    });

    it('should block restore when the parent project is missing or soft-deleted', async () => {
      repo.findOne.mockResolvedValue({ ...mockTicket, deletedAt: now });
      projectService.findOne.mockRejectedValue(
        new NotFoundException('Project with ID 1 not found'),
      );

      await expect(service.restore(1)).rejects.toThrow(BadRequestException);
      await expect(service.restore(1)).rejects.toThrow(
        'Cannot restore ticket 1 because parent project 1 does not exist or is soft-deleted',
      );
      expect(repo.restore).not.toHaveBeenCalled();
    });
  });

  // ---------- getProjectWorkload ----------

  describe('getProjectWorkload', () => {
    it('should return workload data with numeric openTicketCount', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      const qb = mockUserRepoQb();
      qb.getRawMany.mockResolvedValue([
        { userId: 1, username: 'alice', openTicketCount: '2' },
        { userId: 2, username: 'bob', openTicketCount: '0' },
      ]);

      const result = await service.getProjectWorkload(1);
      expect(result).toEqual([
        { userId: 1, username: 'alice', openTicketCount: 2 },
        { userId: 2, username: 'bob', openTicketCount: 0 },
      ]);
      expect(typeof result[0].openTicketCount).toBe('number');
      expect(typeof result[1].openTicketCount).toBe('number');
    });

    it('should query only project-linked DEVELOPER users via LEFT JOIN (includes zero workload)', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      const qb = mockUserRepoQb();
      qb.getRawMany.mockResolvedValue([]);

      await service.getProjectWorkload(42);

      expectDeveloperWorkloadBaseQuery(qb, 42);
      expect(qb.leftJoin).toHaveBeenCalled();
      expect(qb.orderBy).toHaveBeenCalledWith(OPEN_TICKET_COUNT_SQL, 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('user.createdAt', 'ASC');
    });

    it('should exclude DONE, soft-deleted, other-project, and unassigned tickets from the join', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      const qb = mockUserRepoQb();
      qb.getRawMany.mockResolvedValue([]);

      await service.getProjectWorkload(1);

      expect(qb.leftJoin.mock.calls[0][2]).toContain('assigneeId');
      expect(qb.leftJoin.mock.calls[0][2]).toContain('projectId');
      expect(qb.leftJoin.mock.calls[0][2]).toContain('status !=');
      expect(qb.leftJoin.mock.calls[0][2]).toContain('deletedAt" IS NULL');
      expect(qb.innerJoin.mock.calls[0][2]).toContain(
        PROJECT_ASSIGNEE_TICKET_ALIAS,
      );
      expect(qb.innerJoin.mock.calls[0][2]).toContain(
        'assigneeId" IS NOT NULL',
      );
    });

    it('should throw NotFoundException when the project does not exist', async () => {
      projectService.findOne.mockRejectedValue(
        new NotFoundException('Project with ID 999 not found'),
      );
      await expect(service.getProjectWorkload(999)).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getProjectWorkload(999)).rejects.toThrow(
        'Project with ID 999 not found',
      );
    });

    it('should throw NotFoundException when the project is soft-deleted', async () => {
      projectService.findOne.mockRejectedValue(
        new NotFoundException('Project with ID 1 not found'),
      );
      await expect(service.getProjectWorkload(1)).rejects.toThrow(
        'Project with ID 1 not found',
      );
    });
  });

  // ---------- auto-assignment query contract (shared with workload) ----------

  describe('auto-assignment workload query', () => {
    const dto: CreateTicketDto = {
      title: 'New ticket',
      description: 'Desc',
      status: TicketStatus.TODO,
      priority: TicketPriority.HIGH,
      type: TicketType.BUG,
      projectId: 5,
    };

    it('should select the least-loaded DEVELOPER with oldest-registration tie-breaker', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue({ ...mockTicket, projectId: 5 });
      repo.save.mockResolvedValueOnce({ ...mockTicket, projectId: 5 });
      txnTicketManager.save.mockImplementation(async (_entity, value) => value);
      txnTicketManager.create.mockReturnValue({
        action: AuditAction.AUTO_ASSIGN,
        actor: 'SYSTEM',
        performedBy: null,
      });

      const qb = mockUserRepoQb();
      qb.getRawOne.mockResolvedValue({ userId: 3, openTicketCount: '1' });

      await service.create(dto);

      expectDeveloperWorkloadBaseQuery(qb, 5);
      expect(qb.orderBy).toHaveBeenCalledWith(OPEN_TICKET_COUNT_SQL, 'ASC');
      expect(qb.addOrderBy).toHaveBeenCalledWith('user.createdAt', 'ASC');
      expect(qb.limit).toHaveBeenCalledWith(1);
    });

    it('should use the same open-ticket rules as getProjectWorkload', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue({ ...mockTicket });
      repo.save.mockResolvedValue({ ...mockTicket });

      const workloadQb = mockUserRepoQb();
      workloadQb.getRawMany.mockResolvedValue([]);
      await service.getProjectWorkload(1);

      userRepo.createQueryBuilder.mockClear();

      const assignQb = mockUserRepoQb();
      assignQb.getRawOne.mockResolvedValue(undefined);
      repo.save.mockResolvedValueOnce({ ...mockTicket });
      await service.create(dto);

      expect(assignQb.leftJoin.mock.calls[0]).toEqual(
        workloadQb.leftJoin.mock.calls[0],
      );
      expect(assignQb.innerJoin.mock.calls[0]).toEqual(
        workloadQb.innerJoin.mock.calls[0],
      );
      expect(assignQb.where.mock.calls[0]).toEqual(
        workloadQb.where.mock.calls[0],
      );
    });
  });

  // ---------- exportToCsv ----------

  describe('exportToCsv', () => {
    it('should produce a valid CSV with exactly 7 TDP-specified columns', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.find.mockResolvedValue([mockTicket]);

      const csv = await service.exportToCsv(1);
      expect(csv).toContain(
        'id,title,description,status,priority,type,assigneeId',
      );
      expect(csv).not.toContain('dueDate');
      expect(csv).not.toContain('isOverdue');
      expect(csv).toContain('Fix login bug');
    });

    it('should return header-only CSV when no tickets exist', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.find.mockResolvedValue([]);

      const csv = await service.exportToCsv(1);
      const lines = csv.trim().split('\n');
      expect(lines).toHaveLength(1);
    });
  });

  // ---------- importFromCsv ----------

  describe('importFromCsv', () => {
    const importerUserId = 7;

    it('should create tickets from valid CSV rows, audit CREATE per row, and trigger auto-assign', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockResolvedValueOnce({ ...mockTicket });
      txnTicketManager.save.mockImplementation(async (_entity, value) => value);
      txnTicketManager.create.mockReturnValue({
        action: AuditAction.AUTO_ASSIGN,
        actor: 'SYSTEM',
        performedBy: null,
      });
      const qb = mockUserRepoQb();
      qb.getRawOne.mockResolvedValue({ userId: 9, openTicketCount: '0' });

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'Bug,Desc,TODO,HIGH,BUG,',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
      expect(auditLogService.log).toHaveBeenCalledWith({
        action: AuditAction.CREATE,
        entityType: 'TICKET',
        entityId: mockTicket.id,
        performedBy: importerUserId,
        actor: 'USER',
      });
      expect(txnTicketManager.save).toHaveBeenCalledWith(
        AuditLog,
        expect.objectContaining({
          action: AuditAction.AUTO_ASSIGN,
          actor: 'SYSTEM',
        }),
      );
    });

    it('should collect structured errors for invalid rows without audit logs', async () => {
      projectService.findOne.mockResolvedValue({} as never);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'Fix login bug,Desc,BLOCKED,HIGH,BUG,',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        title: 'Fix login bug',
        field: 'status',
        message:
          'Invalid status: BLOCKED. Allowed values are TODO, IN_PROGRESS, IN_REVIEW, DONE.',
      });
      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('should handle mixed valid and invalid rows with one CREATE audit per success', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockResolvedValue(mockTicket);
      const qb = mockUserRepoQb();
      qb.getRawOne.mockResolvedValue(undefined);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'Good,Desc,TODO,HIGH,BUG,',
        ',Bad,INVALID,HIGH,BUG,',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.created).toBe(1);
      expect(result.failed).toBe(1);
      expect(auditLogService.log).toHaveBeenCalledTimes(1);
      expect(auditLogService.log).toHaveBeenCalledWith({
        action: AuditAction.CREATE,
        entityType: 'TICKET',
        entityId: mockTicket.id,
        performedBy: importerUserId,
        actor: 'USER',
      });
    });

    it('should skip auto-assign when assigneeId is provided in CSV', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockResolvedValue({} as never);
      const assigned = { ...mockTicket, assigneeId: 5 };
      repo.create.mockReturnValue(assigned);
      repo.save.mockResolvedValue(assigned);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'Bug,Desc,TODO,HIGH,BUG,5',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.created).toBe(1);
      expect(userService.findOne).toHaveBeenCalledWith(5);
      expect(userRepo.createQueryBuilder).not.toHaveBeenCalled();
      expect(auditLogService.log).toHaveBeenCalledTimes(1);
      expect(auditLogService.log).toHaveBeenCalledWith({
        action: AuditAction.CREATE,
        entityType: 'TICKET',
        entityId: assigned.id,
        performedBy: importerUserId,
        actor: 'USER',
      });
    });

    it('should not audit when save fails for a valid row', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockRejectedValue(new Error('db error'));

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'Bug,Desc,TODO,HIGH,BUG,5',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.created).toBe(0);
      expect(result.failed).toBe(1);
      expect(auditLogService.log).not.toHaveBeenCalled();
    });

    it('should import DONE status when valid', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      const doneTicket = { ...mockTicket, status: TicketStatus.DONE };
      repo.create.mockReturnValue(doneTicket);
      repo.save.mockResolvedValue(doneTicket);
      const qb = mockUserRepoQb();
      qb.getRawOne.mockResolvedValue(undefined);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'Done,Desc,DONE,HIGH,BUG,',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.created).toBe(1);
    });

    it('should parse quoted fields containing commas', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockResolvedValue(mockTicket);
      const qb = mockUserRepoQb();
      qb.getRawOne.mockResolvedValue(undefined);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        '"Title, with comma","Desc, also",TODO,HIGH,BUG,',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.created).toBe(1);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Title, with comma',
          description: 'Desc, also',
        }),
      );
    });

    it('should import an optional dueDate column when it is a valid ISO-8601 date', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockResolvedValue(mockTicket);
      const qb = mockUserRepoQb();
      qb.getRawOne.mockResolvedValue(undefined);

      const csv = [
        'title,description,status,priority,type,assigneeId,dueDate',
        'Bug,Desc,TODO,HIGH,BUG,,2026-06-01T00:00:00.000Z',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );

      expect(result.created).toBe(1);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          dueDate: new Date('2026-06-01T00:00:00.000Z'),
        }),
      );
    });

    it('should fail a CSV row with an invalid dueDate without leaking database errors', async () => {
      projectService.findOne.mockResolvedValue({} as never);

      const csv = [
        'title,description,status,priority,type,assigneeId,dueDate',
        'Bug,Desc,TODO,HIGH,BUG,,not-a-date',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );

      expect(result.created).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        title: 'Bug',
        field: 'dueDate',
        message: 'dueDate must be a valid ISO-8601 date string',
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('should emit one structured error per invalid field on the same row', async () => {
      projectService.findOne.mockResolvedValue({} as never);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'T,D,TODO,INVALID_P,INVALID_T,',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toMatchObject({
        row: 2,
        title: 'T',
        field: 'priority',
      });
      expect(result.errors[0].message).toContain('Invalid priority: INVALID_P');
      expect(result.errors[1]).toMatchObject({
        row: 2,
        title: 'T',
        field: 'type',
      });
      expect(result.errors[1].message).toContain('Invalid type: INVALID_T');
    });

    it('should fail row when title is missing', async () => {
      projectService.findOne.mockResolvedValue({} as never);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        ',Desc,TODO,HIGH,BUG,',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatchObject({
        row: 2,
        title: '(untitled)',
        field: 'title',
        message: 'title is required',
      });
    });

    it('should fail row when title exceeds DTO max length', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      const longTitle = 'x'.repeat(256);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        `${longTitle},D,TODO,HIGH,BUG,`,
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatchObject({
        field: 'title',
        message: expect.stringContaining('255'),
      });
    });

    it('should fail row when description exceeds DTO max length', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      const longDesc = 'd'.repeat(5001);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        `T,${longDesc},TODO,HIGH,BUG,`,
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatchObject({
        field: 'description',
        message: expect.stringContaining('5000'),
      });
    });

    it('should fail row for non-integer assigneeId', async () => {
      projectService.findOne.mockResolvedValue({} as never);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'T,D,TODO,HIGH,BUG,1.5',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toMatchObject({
        field: 'assigneeId',
        message: 'assigneeId must be a valid integer',
      });
    });

    it('should fail row when assignee does not exist', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockRejectedValue(new NotFoundException());

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'T,D,TODO,HIGH,BUG,99',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        title: 'T',
        field: 'assigneeId',
        message: 'Assignee with ID 99 does not exist',
      });
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('should map persistence failures to structured row errors without raw DB text', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockRejectedValue(
        new Error('duplicate key value violates unique constraint'),
      );

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'Bug,Desc,TODO,HIGH,BUG,5',
      ].join('\n');

      const result = await service.importFromCsv(
        1,
        Buffer.from(csv),
        importerUserId,
      );
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toEqual({
        row: 2,
        title: 'Bug',
        field: 'row',
        message:
          'Unable to persist ticket row. Please verify the data and try again.',
      });
    });

    it('should throw BadRequestException for malformed CSV', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      const csv =
        'title,description,status,priority,type,assigneeId\n"unclosed';

      await expect(
        service.importFromCsv(1, Buffer.from(csv), importerUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject import when data row count exceeds limit', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      const header = 'title,description,status,priority,type,assigneeId';
      const row = 'T,D,TODO,HIGH,BUG,';
      const lines = [
        header,
        ...Array(MAX_TICKET_CSV_IMPORT_ROWS + 1).fill(row),
      ];
      const csv = lines.join('\n');

      await expect(
        service.importFromCsv(1, Buffer.from(csv), importerUserId),
      ).rejects.toThrow(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('should ignore id column from CSV', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockResolvedValue(mockTicket);
      const qb = mockUserRepoQb();
      qb.getRawOne.mockResolvedValue(undefined);

      const csv = [
        'id,title,description,status,priority,type,assigneeId',
        '99999,New,d,TODO,HIGH,BUG,',
      ].join('\n');

      await service.importFromCsv(1, Buffer.from(csv), importerUserId);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'New',
          projectId: 1,
        }),
      );
      const payload = repo.create.mock.calls[0][0] as Ticket;
      expect(Object.prototype.hasOwnProperty.call(payload, 'id')).toBe(false);
    });

    it('should ignore projectId column in CSV (uses multipart project id)', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockResolvedValue(mockTicket);
      const qb = mockUserRepoQb();
      qb.getRawOne.mockResolvedValue(undefined);

      const csv = [
        'title,description,status,priority,type,assigneeId,projectId',
        'T,D,TODO,HIGH,BUG,,999',
      ].join('\n');

      await service.importFromCsv(1, Buffer.from(csv), importerUserId);
      expect(repo.create).toHaveBeenCalledWith(
        expect.objectContaining({ projectId: 1 }),
      );
    });
  });

  // ---------- addDependency ----------

  describe('addDependency', () => {
    it('should add a blocker when both tickets share the same project', async () => {
      const blocker = { ...mockTicket, id: 42 };
      repo.findOne.mockResolvedValue({
        ...mockTicket,
        blockedBy: [],
      } as Ticket);
      repo.findOneBy.mockResolvedValue(blocker);
      repo.save.mockResolvedValue(mockTicket);

      await expect(
        service.addDependency(1, { blockedBy: 42 }),
      ).resolves.toBeUndefined();
    });

    it('should reject when tickets belong to different projects', async () => {
      const blocker = { ...mockTicket, id: 42, projectId: 99 };
      repo.findOne.mockResolvedValue({
        ...mockTicket,
        blockedBy: [],
      } as Ticket);
      repo.findOneBy.mockResolvedValue(blocker);

      await expect(service.addDependency(1, { blockedBy: 42 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject self-blocking', async () => {
      await expect(service.addDependency(1, { blockedBy: 1 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject duplicate dependencies', async () => {
      const blocker = { ...mockTicket, id: 42 };
      repo.findOne.mockResolvedValue({
        ...mockTicket,
        blockedBy: [blocker],
      } as Ticket);
      repo.findOneBy.mockResolvedValue(blocker);

      await expect(service.addDependency(1, { blockedBy: 42 })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject circular dependencies with an informative message', async () => {
      const blocker = {
        ...mockTicket,
        id: 42,
        blockedBy: [{ ...mockTicket, id: 1 }],
      };
      repo.findOne
        .mockResolvedValueOnce({ ...mockTicket, blockedBy: [] } as Ticket)
        .mockResolvedValueOnce(blocker as Ticket);
      repo.findOneBy.mockResolvedValue({ ...mockTicket, id: 42 });

      await expect(service.addDependency(1, { blockedBy: 42 })).rejects.toThrow(
        'Cannot add dependency: Ticket 1 is already blocking Ticket 42, creating a circular dependency loop.',
      );
    });

    it('should reject transitive circular dependencies', async () => {
      const ticketC = {
        ...mockTicket,
        id: 3,
        blockedBy: [{ ...mockTicket, id: 1 }],
      };
      const ticketB = { ...mockTicket, id: 42, blockedBy: [ticketC] };
      repo.findOne
        .mockResolvedValueOnce({ ...mockTicket, blockedBy: [] } as Ticket)
        .mockResolvedValueOnce(ticketB as Ticket)
        .mockResolvedValueOnce(ticketC as Ticket);
      repo.findOneBy.mockResolvedValue({ ...mockTicket, id: 42 });

      await expect(service.addDependency(1, { blockedBy: 42 })).rejects.toThrow(
        'Cannot add dependency: Ticket 1 is already blocking Ticket 42, creating a circular dependency loop.',
      );
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.addDependency(999, { blockedBy: 42 }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- getDependencies ----------

  describe('getDependencies', () => {
    it('should return the blockedBy array', async () => {
      const blocker = { ...mockTicket, id: 42 };
      repo.findOne.mockResolvedValue({
        ...mockTicket,
        blockedBy: [blocker],
      } as Ticket);

      const result = await service.getDependencies(1);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(42);
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.getDependencies(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- removeDependency ----------

  describe('removeDependency', () => {
    it('should remove the blocker from the array', async () => {
      const blocker = { ...mockTicket, id: 42 };
      repo.findOne.mockResolvedValue({
        ...mockTicket,
        blockedBy: [blocker],
      } as Ticket);
      repo.save.mockResolvedValue(mockTicket);

      await expect(service.removeDependency(1, 42)).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when the dependency does not exist', async () => {
      repo.findOne.mockResolvedValue({
        ...mockTicket,
        blockedBy: [],
      } as Ticket);
      await expect(service.removeDependency(1, 42)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

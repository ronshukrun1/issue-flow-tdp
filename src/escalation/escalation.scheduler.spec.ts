import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EscalationScheduler } from './escalation.scheduler';
import { Ticket } from '../ticket/ticket.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { TicketStatus } from '../ticket/enums/ticket-status.enum';
import { TicketPriority } from '../ticket/enums/ticket-priority.enum';
import { TicketType } from '../ticket/enums/ticket-type.enum';
import { AuditAction } from '../audit-log/enums/audit-action.enum';

const pastDate = new Date('2020-01-01');

const baseTicket: Ticket = {
  id: 1,
  title: 'Test',
  description: 'desc',
  status: TicketStatus.TODO,
  priority: TicketPriority.LOW,
  type: TicketType.BUG,
  projectId: 1,
  project: undefined as never,
  assigneeId: null,
  assignee: null,
  dueDate: pastDate,
  isOverdue: false,
  blockedBy: [],
  version: 1,
  createdAt: pastDate,
  updatedAt: pastDate,
  deletedAt: null,
};

describe('EscalationScheduler', () => {
  let scheduler: EscalationScheduler;
  let repo: jest.Mocked<Repository<Ticket>>;
  let auditLogService: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EscalationScheduler,
        {
          provide: getRepositoryToken(Ticket),
          useValue: {
            find: jest.fn(),
            save: jest.fn().mockImplementation(async (t) => t),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            log: jest.fn().mockResolvedValue({}),
            logMany: jest.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compile();

    scheduler = module.get<EscalationScheduler>(EscalationScheduler);
    repo = module.get(getRepositoryToken(Ticket));
    auditLogService = module.get(AuditLogService);
  });

  it('should be defined', () => {
    expect(scheduler).toBeDefined();
  });

  it('should promote LOW to MEDIUM via bulk save', async () => {
    const ticket = { ...baseTicket, priority: TicketPriority.LOW };
    repo.find.mockResolvedValue([ticket]);

    await scheduler.handleEscalation();

    expect(repo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        priority: TicketPriority.MEDIUM,
        isOverdue: false,
      }),
    ]);
    expect(auditLogService.logMany).toHaveBeenCalledWith([
      expect.objectContaining({
        action: AuditAction.AUTO_ESCALATE,
        actor: 'SYSTEM',
      }),
    ]);
  });

  it('should promote MEDIUM to HIGH', async () => {
    const ticket = { ...baseTicket, priority: TicketPriority.MEDIUM };
    repo.find.mockResolvedValue([ticket]);

    await scheduler.handleEscalation();

    expect(repo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        priority: TicketPriority.HIGH,
        isOverdue: false,
      }),
    ]);
  });

  it('should promote HIGH to CRITICAL and set isOverdue = true', async () => {
    const ticket = { ...baseTicket, priority: TicketPriority.HIGH };
    repo.find.mockResolvedValue([ticket]);

    await scheduler.handleEscalation();

    expect(repo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        priority: TicketPriority.CRITICAL,
        isOverdue: true,
      }),
    ]);
  });

  it('should set isOverdue on CRITICAL that is not yet overdue', async () => {
    const ticket = {
      ...baseTicket,
      priority: TicketPriority.CRITICAL,
      isOverdue: false,
    };
    repo.find.mockResolvedValue([ticket]);

    await scheduler.handleEscalation();

    expect(repo.save).toHaveBeenCalledWith([
      expect.objectContaining({
        priority: TicketPriority.CRITICAL,
        isOverdue: true,
      }),
    ]);
  });

  it('should skip CRITICAL tickets already marked isOverdue', async () => {
    const ticket = {
      ...baseTicket,
      priority: TicketPriority.CRITICAL,
      isOverdue: true,
    };
    repo.find.mockResolvedValue([ticket]);

    await scheduler.handleEscalation();

    expect(repo.save).not.toHaveBeenCalled();
    expect(auditLogService.logMany).not.toHaveBeenCalled();
  });

  it('should handle empty result set without errors', async () => {
    repo.find.mockResolvedValue([]);

    await scheduler.handleEscalation();

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('should batch-save multiple tickets in one call', async () => {
    const t1 = { ...baseTicket, id: 1, priority: TicketPriority.LOW };
    const t2 = { ...baseTicket, id: 2, priority: TicketPriority.HIGH };
    repo.find.mockResolvedValue([t1, t2]);

    await scheduler.handleEscalation();

    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: 1, priority: TicketPriority.MEDIUM }),
        expect.objectContaining({ id: 2, priority: TicketPriority.CRITICAL }),
      ]),
    );
    expect(auditLogService.logMany).toHaveBeenCalledTimes(1);
    expect(auditLogService.logMany).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ entityId: 1 }),
        expect.objectContaining({ entityId: 2 }),
      ]),
    );
  });

  it('should skip overlapping invocations via concurrency guard', async () => {
    let resolveFirst!: () => void;
    const blockingPromise = new Promise<void>((resolve) => {
      resolveFirst = resolve;
    });

    repo.find.mockImplementation(async () => {
      await blockingPromise;
      return [];
    });

    const first = scheduler.handleEscalation();
    const second = scheduler.handleEscalation();

    resolveFirst();
    await first;
    await second;

    expect(repo.find).toHaveBeenCalledTimes(1);
  });
});

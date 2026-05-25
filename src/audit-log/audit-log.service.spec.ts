import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './audit-log.entity';
import { AuditAction } from './enums/audit-action.enum';

const now = new Date();

const mockAuditLog: AuditLog = {
  id: 1,
  action: AuditAction.CREATE,
  entityType: 'TICKET',
  entityId: 42,
  performedBy: 1,
  performer: null,
  actor: 'USER',
  timestamp: now,
};

describe('AuditLogService', () => {
  let service: AuditLogService;
  let repo: jest.Mocked<Repository<AuditLog>>;

  let loggerSpy: jest.SpyInstance;

  beforeAll(() => {
    loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
  });

  afterAll(() => {
    loggerSpy.mockRestore();
  });

  beforeEach(async () => {
    const qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn().mockResolvedValue([mockAuditLog]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditLogService,
        {
          provide: getRepositoryToken(AuditLog),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(qb),
          },
        },
      ],
    }).compile();

    service = module.get<AuditLogService>(AuditLogService);
    repo = module.get(getRepositoryToken(AuditLog));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('log', () => {
    it('should persist an audit log entry', async () => {
      repo.create.mockReturnValue(mockAuditLog);
      repo.save.mockResolvedValue(mockAuditLog);

      const entry = {
        action: AuditAction.CREATE,
        entityType: 'TICKET',
        entityId: 42,
        performedBy: 1,
        actor: 'USER',
      };

      const result = await service.log(entry);
      expect(repo.create).toHaveBeenCalledWith(entry);
      expect(repo.save).toHaveBeenCalledWith(mockAuditLog);
      expect(result).toEqual(mockAuditLog);
    });

    it('should allow null performedBy for system actions', async () => {
      const systemEntry = {
        ...mockAuditLog,
        performedBy: null,
        actor: 'SYSTEM',
        action: AuditAction.AUTO_ESCALATE,
      };
      repo.create.mockReturnValue(systemEntry);
      repo.save.mockResolvedValue(systemEntry);

      const result = await service.log({
        action: AuditAction.AUTO_ESCALATE,
        entityType: 'TICKET',
        entityId: 42,
        performedBy: null,
        actor: 'SYSTEM',
      });
      expect(result?.actor).toBe('SYSTEM');
      expect(result?.performedBy).toBeNull();
    });

    it('should return null and not throw when persistence fails', async () => {
      repo.create.mockReturnValue(mockAuditLog);
      repo.save.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.log({
        action: AuditAction.CREATE,
        entityType: 'TICKET',
        entityId: 42,
        performedBy: 1,
        actor: 'USER',
      });
      expect(result).toBeNull();
    });
  });

  describe('logMany', () => {
    it('should batch-insert multiple audit log entries', async () => {
      const entry1 = { ...mockAuditLog, entityId: 1 };
      const entry2 = { ...mockAuditLog, entityId: 2 };
      repo.create.mockReturnValueOnce(entry1).mockReturnValueOnce(entry2);
      repo.save.mockResolvedValue([entry1, entry2] as never);

      const entries = [
        {
          action: AuditAction.AUTO_ESCALATE,
          entityType: 'TICKET',
          entityId: 1,
          performedBy: null,
          actor: 'SYSTEM',
        },
        {
          action: AuditAction.AUTO_ESCALATE,
          entityType: 'TICKET',
          entityId: 2,
          performedBy: null,
          actor: 'SYSTEM',
        },
      ];

      const result = await service.logMany(entries);
      expect(repo.create).toHaveBeenCalledTimes(2);
      expect(repo.save).toHaveBeenCalledWith([entry1, entry2]);
      expect(result).toEqual([entry1, entry2]);
    });

    it('should return empty array when given no entries', async () => {
      const result = await service.logMany([]);
      expect(result).toEqual([]);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('should return all audit logs when no filters', async () => {
      const result = await service.findAll({});
      expect(result).toEqual([mockAuditLog]);
    });

    it('should apply entityType filter', async () => {
      const qb = repo.createQueryBuilder('log');
      await service.findAll({ entityType: 'TICKET' });
      expect(qb.andWhere).toHaveBeenCalledWith('log.entityType = :entityType', {
        entityType: 'TICKET',
      });
    });

    it('should apply multiple filters simultaneously', async () => {
      const qb = repo.createQueryBuilder('log');
      await service.findAll({
        entityType: 'USER',
        action: 'CREATE',
        actor: 'USER',
      });
      expect(qb.andWhere).toHaveBeenCalledTimes(3);
    });

    it('should apply entityId filter', async () => {
      const qb = repo.createQueryBuilder('log');
      await service.findAll({ entityId: 42 });
      expect(qb.andWhere).toHaveBeenCalledWith('log.entityId = :entityId', {
        entityId: 42,
      });
    });
  });
});

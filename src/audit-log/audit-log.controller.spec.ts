import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { AuditLogController } from './audit-log.controller';
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

describe('AuditLogController', () => {
  let controller: AuditLogController;
  let service: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuditLogController],
      providers: [
        {
          provide: AuditLogService,
          useValue: { findAll: jest.fn() },
        },
      ],
    }).compile();

    controller = module.get<AuditLogController>(AuditLogController);
    service = module.get(AuditLogService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should delegate to service without filters', async () => {
      service.findAll.mockResolvedValue([mockAuditLog]);

      const result = await controller.findAll();
      expect(result).toEqual([mockAuditLog]);
      expect(service.findAll).toHaveBeenCalledWith({
        entityType: undefined,
        entityId: undefined,
        action: undefined,
        actor: undefined,
      });
    });

    it('should pass filters to the service', async () => {
      service.findAll.mockResolvedValue([]);

      await controller.findAll('TICKET', '42', 'CREATE', 'USER');
      expect(service.findAll).toHaveBeenCalledWith({
        entityType: 'TICKET',
        entityId: 42,
        action: 'CREATE',
        actor: 'USER',
      });
    });

    it('should handle partial filters', async () => {
      service.findAll.mockResolvedValue([mockAuditLog]);

      await controller.findAll('PROJECT', undefined, undefined, 'SYSTEM');
      expect(service.findAll).toHaveBeenCalledWith({
        entityType: 'PROJECT',
        entityId: undefined,
        action: undefined,
        actor: 'SYSTEM',
      });
    });

    it('should reject invalid entityId filters with 400', async () => {
      expect(() => controller.findAll(undefined, 'abc')).toThrow(
        BadRequestException,
      );
      expect(service.findAll).not.toHaveBeenCalled();
    });
  });
});

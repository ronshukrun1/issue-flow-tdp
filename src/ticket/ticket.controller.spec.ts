import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Ticket } from './ticket.entity';
import { TicketStatus } from './enums/ticket-status.enum';
import { TicketPriority } from './enums/ticket-priority.enum';
import { TicketType } from './enums/ticket-type.enum';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { Role } from '../user/role.enum';

const now = new Date();

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

const mockRequest = (userId: number): Request =>
  ({ user: { userId, username: 'admin', role: Role.ADMIN } }) as unknown as Request;

describe('TicketController', () => {
  let controller: TicketController;
  let service: jest.Mocked<TicketService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TicketController],
      providers: [
        {
          provide: TicketService,
          useValue: {
            findByProject: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            softRemove: jest.fn(),
            findDeleted: jest.fn(),
            restore: jest.fn(),
            addDependency: jest.fn(),
            getDependencies: jest.fn(),
            removeDependency: jest.fn(),
            exportToCsv: jest.fn(),
            importFromCsv: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    controller = module.get<TicketController>(TicketController);
    service = module.get(TicketService);
    auditLogService = module.get(AuditLogService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findByProject', () => {
    it('should return tickets filtered by project', async () => {
      service.findByProject.mockResolvedValue([mockTicket]);
      expect(await controller.findByProject(1)).toEqual([mockTicket]);
    });

    it('should propagate NotFoundException', async () => {
      service.findByProject.mockRejectedValue(new NotFoundException());
      await expect(controller.findByProject(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('findDeleted', () => {
    it('should return soft-deleted tickets for a project', async () => {
      const deleted = { ...mockTicket, deletedAt: now };
      service.findDeleted.mockResolvedValue([deleted]);
      expect(await controller.findDeleted(1)).toEqual([deleted]);
    });
  });

  describe('exportCsv', () => {
    it('should set CSV headers and send content', async () => {
      service.exportToCsv.mockResolvedValue('id,title\n1,Bug\n');
      const res = { setHeader: jest.fn(), send: jest.fn() } as never;
      await controller.exportCsv(1, res);
      expect(service.exportToCsv).toHaveBeenCalledWith(1);
    });
  });

  describe('importCsv', () => {
    it('should delegate to service with authenticated userId and return summary', async () => {
      const summary = { created: 2, failed: 0, errors: [] as string[] };
      service.importFromCsv.mockResolvedValue(summary);
      const file = { buffer: Buffer.from('csv') } as Express.Multer.File;
      const req = mockRequest(42);
      const result = await controller.importCsv(file, 1, req);
      expect(result).toEqual(summary);
      expect(service.importFromCsv).toHaveBeenCalledWith(1, file.buffer, 42);
    });
  });

  describe('findOne', () => {
    it('should return a ticket by ID', async () => {
      service.findOne.mockResolvedValue(mockTicket);
      expect(await controller.findOne(1)).toEqual(mockTicket);
    });

    it('should propagate NotFoundException', async () => {
      service.findOne.mockRejectedValue(new NotFoundException());
      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto: CreateTicketDto = {
      title: 'Fix login bug',
      description: 'Users cannot log in on mobile',
      status: TicketStatus.TODO,
      priority: TicketPriority.HIGH,
      type: TicketType.BUG,
      projectId: 1,
    };

    it('should create the ticket and log audit', async () => {
      service.create.mockResolvedValue(mockTicket);
      const req = mockRequest(10);
      const result = await controller.create(dto, req);
      expect(result).toEqual(mockTicket);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entityType: 'TICKET' }),
      );
    });

    it('should propagate BadRequestException', async () => {
      service.create.mockRejectedValue(new BadRequestException());
      await expect(controller.create({ ...dto, projectId: 999 }, mockRequest(10))).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const dto: UpdateTicketDto = { title: 'Updated title' };

    it('should update the ticket and log audit', async () => {
      const updated = { ...mockTicket, title: 'Updated title' };
      service.update.mockResolvedValue(updated);
      const req = mockRequest(10);
      const result = await controller.update(1, dto, req);
      expect(result).toEqual(updated);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate BadRequestException for DONE ticket', async () => {
      service.update.mockRejectedValue(new BadRequestException());
      await expect(controller.update(1, dto, mockRequest(10))).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('should soft-delete and log audit', async () => {
      service.softRemove.mockResolvedValue(undefined);
      const req = mockRequest(10);
      await expect(controller.remove(1, req)).resolves.toBeUndefined();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate NotFoundException', async () => {
      service.softRemove.mockRejectedValue(new NotFoundException());
      await expect(controller.remove(999, mockRequest(10))).rejects.toThrow(NotFoundException);
    });
  });

  describe('restore', () => {
    it('should restore and log audit', async () => {
      service.restore.mockResolvedValue(undefined);
      const req = mockRequest(10);
      await expect(controller.restore(1, req)).resolves.toBeUndefined();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate NotFoundException', async () => {
      service.restore.mockRejectedValue(new NotFoundException());
      await expect(controller.restore(999, mockRequest(10))).rejects.toThrow(NotFoundException);
    });
  });

  describe('addDependency', () => {
    it('should delegate to service and log audit', async () => {
      service.addDependency.mockResolvedValue(undefined);
      const req = mockRequest(10);
      await expect(controller.addDependency(1, { blockedBy: 42 }, req)).resolves.toBeUndefined();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate BadRequestException', async () => {
      service.addDependency.mockRejectedValue(new BadRequestException());
      await expect(controller.addDependency(1, { blockedBy: 42 }, mockRequest(10))).rejects.toThrow(BadRequestException);
    });
  });

  describe('getDependencies', () => {
    it('should return only id, title, status per blocking ticket', async () => {
      service.getDependencies.mockResolvedValue([mockTicket]);
      const result = await controller.getDependencies(1);
      expect(result).toEqual([
        { id: mockTicket.id, title: mockTicket.title, status: mockTicket.status },
      ]);
    });
  });

  describe('removeDependency', () => {
    it('should delegate to service and log audit', async () => {
      service.removeDependency.mockResolvedValue(undefined);
      const req = mockRequest(10);
      await expect(controller.removeDependency(1, 42, req)).resolves.toBeUndefined();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate NotFoundException', async () => {
      service.removeDependency.mockRejectedValue(new NotFoundException());
      await expect(controller.removeDependency(1, 42, mockRequest(10))).rejects.toThrow(NotFoundException);
    });
  });
});

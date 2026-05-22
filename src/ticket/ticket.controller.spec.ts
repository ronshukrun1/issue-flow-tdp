import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TicketController } from './ticket.controller';
import { TicketService } from './ticket.service';
import { Ticket } from './ticket.entity';
import { TicketStatus } from './enums/ticket-status.enum';
import { TicketPriority } from './enums/ticket-priority.enum';
import { TicketType } from './enums/ticket-type.enum';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';

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
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

describe('TicketController', () => {
  let controller: TicketController;
  let service: jest.Mocked<TicketService>;

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
      ],
    }).compile();

    controller = module.get<TicketController>(TicketController);
    service = module.get(TicketService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------- findByProject ----------

  describe('findByProject', () => {
    it('should return tickets filtered by project', async () => {
      service.findByProject.mockResolvedValue([mockTicket]);
      expect(await controller.findByProject(1)).toEqual([mockTicket]);
    });

    it('should propagate NotFoundException for invalid project', async () => {
      service.findByProject.mockRejectedValue(
        new NotFoundException('Project with ID 999 not found'),
      );
      await expect(controller.findByProject(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- findDeleted ----------

  describe('findDeleted', () => {
    it('should return soft-deleted tickets for a project', async () => {
      const deleted = { ...mockTicket, deletedAt: now };
      service.findDeleted.mockResolvedValue([deleted]);
      expect(await controller.findDeleted(1)).toEqual([deleted]);
    });
  });

  // ---------- exportCsv ----------

  describe('exportCsv', () => {
    it('should set CSV headers and send the content', async () => {
      service.exportToCsv.mockResolvedValue('id,title\n1,Bug\n');
      const res = {
        setHeader: jest.fn(),
        send: jest.fn(),
      } as never;
      await controller.exportCsv(1, res);
      expect(service.exportToCsv).toHaveBeenCalledWith(1);
    });
  });

  // ---------- importCsv ----------

  describe('importCsv', () => {
    it('should delegate to service and return summary', async () => {
      const summary = { created: 2, failed: 0, errors: [] as string[] };
      service.importFromCsv.mockResolvedValue(summary);

      const file = { buffer: Buffer.from('csv') } as Express.Multer.File;
      const result = await controller.importCsv(file, 1);
      expect(result).toEqual(summary);
    });
  });

  // ---------- findOne ----------

  describe('findOne', () => {
    it('should return a ticket by ID', async () => {
      service.findOne.mockResolvedValue(mockTicket);
      expect(await controller.findOne(1)).toEqual(mockTicket);
    });

    it('should propagate NotFoundException', async () => {
      service.findOne.mockRejectedValue(
        new NotFoundException('Ticket with ID 999 not found'),
      );
      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
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

    it('should create and return a ticket', async () => {
      service.create.mockResolvedValue(mockTicket);
      expect(await controller.create(dto)).toEqual(mockTicket);
    });

    it('should propagate BadRequestException for invalid project', async () => {
      service.create.mockRejectedValue(
        new BadRequestException('Project with ID 999 does not exist'),
      );
      await expect(
        controller.create({ ...dto, projectId: 999 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------- update ----------

  describe('update', () => {
    const dto: UpdateTicketDto = { title: 'Updated title' };

    it('should update and return the modified ticket', async () => {
      const updated = { ...mockTicket, title: 'Updated title' };
      service.update.mockResolvedValue(updated);
      expect(await controller.update(1, dto)).toEqual(updated);
    });

    it('should propagate BadRequestException for DONE ticket', async () => {
      service.update.mockRejectedValue(
        new BadRequestException('Cannot update a ticket that is already DONE'),
      );
      await expect(controller.update(1, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------- remove ----------

  describe('remove', () => {
    it('should soft-delete the ticket', async () => {
      service.softRemove.mockResolvedValue(undefined);
      await expect(controller.remove(1)).resolves.toBeUndefined();
    });

    it('should propagate NotFoundException', async () => {
      service.softRemove.mockRejectedValue(
        new NotFoundException('Ticket with ID 999 not found'),
      );
      await expect(controller.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- restore ----------

  describe('restore', () => {
    it('should restore a soft-deleted ticket', async () => {
      service.restore.mockResolvedValue(undefined);
      await expect(controller.restore(1)).resolves.toBeUndefined();
    });

    it('should propagate NotFoundException', async () => {
      service.restore.mockRejectedValue(
        new NotFoundException('Soft-deleted ticket with ID 999 not found'),
      );
      await expect(controller.restore(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- addDependency ----------

  describe('addDependency', () => {
    it('should delegate to service', async () => {
      service.addDependency.mockResolvedValue(undefined);
      await expect(
        controller.addDependency(1, { blockedBy: 42 }),
      ).resolves.toBeUndefined();
    });

    it('should propagate BadRequestException for cross-project dependency', async () => {
      service.addDependency.mockRejectedValue(
        new BadRequestException('Both tickets must belong to the same project'),
      );
      await expect(
        controller.addDependency(1, { blockedBy: 42 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------- getDependencies ----------

  describe('getDependencies', () => {
    it('should return blocking tickets', async () => {
      service.getDependencies.mockResolvedValue([mockTicket]);
      expect(await controller.getDependencies(1)).toEqual([mockTicket]);
    });
  });

  // ---------- removeDependency ----------

  describe('removeDependency', () => {
    it('should delegate to service', async () => {
      service.removeDependency.mockResolvedValue(undefined);
      await expect(
        controller.removeDependency(1, 42),
      ).resolves.toBeUndefined();
    });

    it('should propagate NotFoundException', async () => {
      service.removeDependency.mockRejectedValue(
        new NotFoundException('Dependency not found'),
      );
      await expect(controller.removeDependency(1, 42)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

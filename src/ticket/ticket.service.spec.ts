import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { TicketService } from './ticket.service';
import { Ticket } from './ticket.entity';
import { ProjectService } from '../project/project.service';
import { UserService } from '../user/user.service';
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

describe('TicketService', () => {
  let service: TicketService;
  let repo: jest.Mocked<Repository<Ticket>>;
  let projectService: jest.Mocked<ProjectService>;
  let userService: jest.Mocked<UserService>;

  beforeEach(async () => {
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
          provide: ProjectService,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: UserService,
          useValue: { findOne: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<TicketService>(TicketService);
    repo = module.get(getRepositoryToken(Ticket));
    projectService = module.get(ProjectService);
    userService = module.get(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
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
      projectService.findOne.mockRejectedValue(
        new NotFoundException('Project with ID 999 not found'),
      );
      await expect(service.findByProject(999)).rejects.toThrow(
        NotFoundException,
      );
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

    it('should validate the project and create a ticket', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockResolvedValue(mockTicket);

      const result = await service.create(dto);
      expect(result).toEqual(mockTicket);
      expect(projectService.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw BadRequestException when project does not exist', async () => {
      projectService.findOne.mockRejectedValue(
        new NotFoundException('Project with ID 999 not found'),
      );

      await expect(
        service.create({ ...dto, projectId: 999 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should validate the assignee when provided', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockResolvedValue(mockTicket);

      await service.create({ ...dto, assigneeId: 5 });
      expect(userService.findOne).toHaveBeenCalledWith(5);
    });

    it('should throw BadRequestException when assignee does not exist', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockRejectedValue(
        new NotFoundException('User with ID 999 not found'),
      );

      await expect(
        service.create({ ...dto, assigneeId: 999 }),
      ).rejects.toThrow(BadRequestException);
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
      repo.findOneBy.mockResolvedValue({ ...mockTicket });
      repo.save.mockResolvedValue(updated);

      const result = await service.update(1, { title: 'New title' });
      expect(result.title).toBe('New title');
    });

    it('should reject updates on a DONE ticket', async () => {
      repo.findOneBy.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.DONE,
      });

      await expect(
        service.update(1, { title: 'Change' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject backward status transitions', async () => {
      repo.findOneBy.mockResolvedValue({
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
      repo.findOneBy.mockResolvedValue(ticket);
      repo.save.mockResolvedValue(updated);

      const result = await service.update(1, {
        status: TicketStatus.IN_PROGRESS,
      });
      expect(result.status).toBe(TicketStatus.IN_PROGRESS);
    });

    it('should reject same-status transitions', async () => {
      repo.findOneBy.mockResolvedValue({
        ...mockTicket,
        status: TicketStatus.IN_REVIEW,
      });

      await expect(
        service.update(1, { status: TicketStatus.IN_REVIEW }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle partial updates (no status change)', async () => {
      const updated = { ...mockTicket, priority: TicketPriority.CRITICAL };
      repo.findOneBy.mockResolvedValue({ ...mockTicket });
      repo.save.mockResolvedValue(updated);

      const result = await service.update(1, {
        priority: TicketPriority.CRITICAL,
      });
      expect(result.priority).toBe(TicketPriority.CRITICAL);
    });

    it('should throw NotFoundException when ticket does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(
        service.update(999, { title: 'X' } as UpdateTicketDto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject DONE transition when unresolved blockers exist', async () => {
      const inReview = { ...mockTicket, status: TicketStatus.IN_REVIEW };
      repo.findOneBy.mockResolvedValue(inReview);

      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(2),
      };
      repo.createQueryBuilder.mockReturnValue(qb as never);

      await expect(
        service.update(1, { status: TicketStatus.DONE }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow DONE transition when all blockers are DONE', async () => {
      const inReview = { ...mockTicket, status: TicketStatus.IN_REVIEW };
      repo.findOneBy.mockResolvedValue(inReview);

      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
      };
      repo.createQueryBuilder.mockReturnValue(qb as never);
      repo.save.mockResolvedValue({ ...inReview, status: TicketStatus.DONE });

      const result = await service.update(1, { status: TicketStatus.DONE });
      expect(result.status).toBe(TicketStatus.DONE);
    });
  });

  // ---------- softRemove ----------

  describe('softRemove', () => {
    it('should soft-delete the ticket', async () => {
      repo.findOneBy.mockResolvedValue(mockTicket);
      repo.softRemove.mockResolvedValue({ ...mockTicket, deletedAt: now });

      await expect(service.softRemove(1)).resolves.toBeUndefined();
      expect(repo.softRemove).toHaveBeenCalledWith(mockTicket);
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
      repo.restore.mockResolvedValue({
        affected: 1,
        raw: [],
        generatedMaps: [],
      });
      await expect(service.restore(1)).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when no soft-deleted ticket found', async () => {
      repo.restore.mockResolvedValue({
        affected: 0,
        raw: [],
        generatedMaps: [],
      });
      await expect(service.restore(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- exportToCsv ----------

  describe('exportToCsv', () => {
    it('should produce a valid CSV with header and data rows', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.find.mockResolvedValue([mockTicket]);

      const csv = await service.exportToCsv(1);
      expect(csv).toContain('id,title,description,status,priority,type,assigneeId');
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
    it('should create tickets from valid CSV rows', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockResolvedValue(mockTicket);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'Bug,Desc,TODO,HIGH,BUG,',
      ].join('\n');

      const result = await service.importFromCsv(1, Buffer.from(csv));
      expect(result.created).toBe(1);
      expect(result.failed).toBe(0);
    });

    it('should collect errors for invalid rows', async () => {
      projectService.findOne.mockResolvedValue({} as never);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        ',Desc,INVALID,HIGH,BUG,',
      ].join('\n');

      const result = await service.importFromCsv(1, Buffer.from(csv));
      expect(result.failed).toBe(1);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Row 2');
    });

    it('should handle mixed valid and invalid rows', async () => {
      projectService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockTicket);
      repo.save.mockResolvedValue(mockTicket);

      const csv = [
        'title,description,status,priority,type,assigneeId',
        'Good,Desc,TODO,HIGH,BUG,',
        ',Bad,INVALID,HIGH,BUG,',
      ].join('\n');

      const result = await service.importFromCsv(1, Buffer.from(csv));
      expect(result.created).toBe(1);
      expect(result.failed).toBe(1);
    });
  });

  // ---------- addDependency ----------

  describe('addDependency', () => {
    it('should add a blocker when both tickets share the same project', async () => {
      const blocker = { ...mockTicket, id: 42 };
      repo.findOne.mockResolvedValue({ ...mockTicket, blockedBy: [] } as Ticket);
      repo.findOneBy.mockResolvedValue(blocker);
      repo.save.mockResolvedValue(mockTicket);

      await expect(
        service.addDependency(1, { blockedBy: 42 }),
      ).resolves.toBeUndefined();
    });

    it('should reject when tickets belong to different projects', async () => {
      const blocker = { ...mockTicket, id: 42, projectId: 99 };
      repo.findOne.mockResolvedValue({ ...mockTicket, blockedBy: [] } as Ticket);
      repo.findOneBy.mockResolvedValue(blocker);

      await expect(
        service.addDependency(1, { blockedBy: 42 }),
      ).rejects.toThrow(BadRequestException);
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

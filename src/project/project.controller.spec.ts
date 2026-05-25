import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { TicketService } from '../ticket/ticket.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Project } from './project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Role } from '../user/role.enum';

const now = new Date();

const mockProject: Project = {
  id: 1,
  name: 'Sample Project',
  description: 'A sample project',
  ownerId: 1,
  owner: undefined as never,
  createdAt: now,
  updatedAt: now,
  deletedAt: null,
};

const mockRequest = (userId: number): Request =>
  ({
    user: { userId, username: 'admin', role: Role.ADMIN },
  }) as unknown as Request;

describe('ProjectController', () => {
  let controller: ProjectController;
  let service: jest.Mocked<ProjectService>;
  let ticketService: jest.Mocked<TicketService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProjectController],
      providers: [
        {
          provide: ProjectService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            softRemove: jest.fn(),
            findDeleted: jest.fn(),
            restore: jest.fn(),
          },
        },
        {
          provide: TicketService,
          useValue: { getProjectWorkload: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    controller = module.get<ProjectController>(ProjectController);
    service = module.get(ProjectService);
    ticketService = module.get(TicketService);
    auditLogService = module.get(AuditLogService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all active projects', async () => {
      service.findAll.mockResolvedValue([mockProject]);
      expect(await controller.findAll()).toEqual([mockProject]);
    });
  });

  describe('findDeleted', () => {
    it('should return soft-deleted projects', async () => {
      const deleted = { ...mockProject, deletedAt: now };
      service.findDeleted.mockResolvedValue([deleted]);
      expect(await controller.findDeleted()).toEqual([deleted]);
    });
  });

  describe('getWorkload', () => {
    it('should delegate to ticketService.getProjectWorkload', async () => {
      const workload = [{ userId: 1, username: 'jdoe', openTicketCount: 3 }];
      ticketService.getProjectWorkload.mockResolvedValue(workload);

      const result = await controller.getWorkload(1);
      expect(result).toEqual(workload);
      expect(ticketService.getProjectWorkload).toHaveBeenCalledWith(1);
    });
  });

  describe('findOne', () => {
    it('should return a project by ID', async () => {
      service.findOne.mockResolvedValue(mockProject);
      expect(await controller.findOne(1)).toEqual(mockProject);
    });

    it('should propagate NotFoundException', async () => {
      service.findOne.mockRejectedValue(new NotFoundException());
      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto: CreateProjectDto = {
      name: 'Sample Project',
      description: 'A sample project',
      ownerId: 1,
    };

    it('should create the project and log audit', async () => {
      service.create.mockResolvedValue(mockProject);
      const req = mockRequest(10);

      const result = await controller.create(dto, req);
      expect(result).toEqual(mockProject);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entityType: 'PROJECT' }),
      );
    });

    it('should propagate BadRequestException for invalid owner', async () => {
      service.create.mockRejectedValue(new BadRequestException());
      await expect(
        controller.create({ ...dto, ownerId: 999 }, mockRequest(10)),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const dto: UpdateProjectDto = { name: 'Updated Name' };

    it('should update the project and log audit without returning a body', async () => {
      service.update.mockResolvedValue({
        ...mockProject,
        name: 'Updated Name',
      });
      const req = mockRequest(10);

      const result = await controller.update(1, dto, req);
      expect(result).toBeUndefined();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate NotFoundException', async () => {
      service.update.mockRejectedValue(new NotFoundException());
      await expect(
        controller.update(999, dto, mockRequest(10)),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should soft-delete the project and log audit', async () => {
      service.softRemove.mockResolvedValue(undefined);
      const req = mockRequest(10);

      await expect(controller.remove(1, req)).resolves.toBeUndefined();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate NotFoundException', async () => {
      service.softRemove.mockRejectedValue(new NotFoundException());
      await expect(controller.remove(999, mockRequest(10))).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('restore', () => {
    it('should restore the project and log audit', async () => {
      service.restore.mockResolvedValue(undefined);
      const req = mockRequest(10);

      await expect(controller.restore(1, req)).resolves.toBeUndefined();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate NotFoundException', async () => {
      service.restore.mockRejectedValue(new NotFoundException());
      await expect(controller.restore(999, mockRequest(10))).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

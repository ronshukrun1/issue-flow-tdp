import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { ProjectController } from './project.controller';
import { ProjectService } from './project.service';
import { Project } from './project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';

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

describe('ProjectController', () => {
  let controller: ProjectController;
  let service: jest.Mocked<ProjectService>;

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
      ],
    }).compile();

    controller = module.get<ProjectController>(ProjectController);
    service = module.get(ProjectService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------- findAll ----------

  describe('findAll', () => {
    it('should return all active projects', async () => {
      service.findAll.mockResolvedValue([mockProject]);
      expect(await controller.findAll()).toEqual([mockProject]);
    });
  });

  // ---------- findDeleted ----------

  describe('findDeleted', () => {
    it('should return soft-deleted projects', async () => {
      const deleted = { ...mockProject, deletedAt: now };
      service.findDeleted.mockResolvedValue([deleted]);
      expect(await controller.findDeleted()).toEqual([deleted]);
    });
  });

  // ---------- findOne ----------

  describe('findOne', () => {
    it('should return a project by ID', async () => {
      service.findOne.mockResolvedValue(mockProject);
      expect(await controller.findOne(1)).toEqual(mockProject);
    });

    it('should propagate NotFoundException', async () => {
      service.findOne.mockRejectedValue(
        new NotFoundException('Project with ID 999 not found'),
      );
      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- create ----------

  describe('create', () => {
    const dto: CreateProjectDto = {
      name: 'Sample Project',
      description: 'A sample project',
      ownerId: 1,
    };

    it('should create and return the new project', async () => {
      service.create.mockResolvedValue(mockProject);
      expect(await controller.create(dto)).toEqual(mockProject);
    });

    it('should propagate BadRequestException for invalid owner', async () => {
      service.create.mockRejectedValue(
        new BadRequestException('Owner with ID 999 does not exist'),
      );
      await expect(controller.create({ ...dto, ownerId: 999 })).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------- update ----------

  describe('update', () => {
    const dto: UpdateProjectDto = {
      name: 'Updated Name',
      description: 'Updated desc',
    };

    it('should update and return the modified project', async () => {
      const updated: Project = { ...mockProject, ...dto };
      service.update.mockResolvedValue(updated);
      expect(await controller.update(1, dto)).toEqual(updated);
    });

    it('should propagate NotFoundException', async () => {
      service.update.mockRejectedValue(
        new NotFoundException('Project with ID 999 not found'),
      );
      await expect(controller.update(999, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- remove (soft delete) ----------

  describe('remove', () => {
    it('should soft-delete the project', async () => {
      service.softRemove.mockResolvedValue(undefined);
      await expect(controller.remove(1)).resolves.toBeUndefined();
    });

    it('should propagate NotFoundException', async () => {
      service.softRemove.mockRejectedValue(
        new NotFoundException('Project with ID 999 not found'),
      );
      await expect(controller.remove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- restore ----------

  describe('restore', () => {
    it('should restore a soft-deleted project', async () => {
      service.restore.mockResolvedValue(undefined);
      await expect(controller.restore(1)).resolves.toBeUndefined();
    });

    it('should propagate NotFoundException', async () => {
      service.restore.mockRejectedValue(
        new NotFoundException('Soft-deleted project with ID 999 not found'),
      );
      await expect(controller.restore(999)).rejects.toThrow(NotFoundException);
    });
  });
});

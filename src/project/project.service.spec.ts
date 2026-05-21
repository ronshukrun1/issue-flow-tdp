import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { Project } from './project.entity';
import { UserService } from '../user/user.service';
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

describe('ProjectService', () => {
  let service: ProjectService;
  let repo: jest.Mocked<Repository<Project>>;
  let userService: jest.Mocked<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProjectService,
        {
          provide: getRepositoryToken(Project),
          useValue: {
            find: jest.fn(),
            findOneBy: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            softRemove: jest.fn(),
            restore: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: UserService,
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<ProjectService>(ProjectService);
    repo = module.get(getRepositoryToken(Project));
    userService = module.get(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------- findAll ----------

  describe('findAll', () => {
    it('should return an array of active projects', async () => {
      repo.find.mockResolvedValue([mockProject]);
      expect(await service.findAll()).toEqual([mockProject]);
    });

    it('should return an empty array when no projects exist', async () => {
      repo.find.mockResolvedValue([]);
      expect(await service.findAll()).toEqual([]);
    });
  });

  // ---------- findOne ----------

  describe('findOne', () => {
    it('should return a project when found', async () => {
      repo.findOneBy.mockResolvedValue(mockProject);
      expect(await service.findOne(1)).toEqual(mockProject);
    });

    it('should throw NotFoundException when project does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- create ----------

  describe('create', () => {
    const dto: CreateProjectDto = {
      name: 'Sample Project',
      description: 'A sample project',
      ownerId: 1,
    };

    it('should validate the owner and create a project', async () => {
      userService.findOne.mockResolvedValue({} as never);
      repo.create.mockReturnValue(mockProject);
      repo.save.mockResolvedValue(mockProject);

      const result = await service.create(dto);
      expect(result).toEqual(mockProject);
      expect(userService.findOne).toHaveBeenCalledWith(1);
    });

    it('should throw BadRequestException when owner does not exist', async () => {
      userService.findOne.mockRejectedValue(
        new NotFoundException('User with ID 999 not found'),
      );

      await expect(
        service.create({ ...dto, ownerId: 999 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should re-throw unexpected errors from owner lookup', async () => {
      const unexpected = new Error('connection lost');
      userService.findOne.mockRejectedValue(unexpected);

      await expect(service.create(dto)).rejects.toThrow('connection lost');
    });
  });

  // ---------- update ----------

  describe('update', () => {
    const dto: UpdateProjectDto = {
      name: 'Updated Name',
      description: 'Updated description',
    };

    it('should update and return the modified project', async () => {
      const updated: Project = { ...mockProject, ...dto };
      repo.findOneBy.mockResolvedValue({ ...mockProject });
      repo.save.mockResolvedValue(updated);

      const result = await service.update(1, dto);
      expect(result.name).toBe('Updated Name');
      expect(result.description).toBe('Updated description');
    });

    it('should only update provided fields (partial update)', async () => {
      const partialDto: UpdateProjectDto = { name: 'Only Name' };
      const updated: Project = { ...mockProject, name: 'Only Name' };
      repo.findOneBy.mockResolvedValue({ ...mockProject });
      repo.save.mockResolvedValue(updated);

      const result = await service.update(1, partialDto);
      expect(result.name).toBe('Only Name');
      expect(result.description).toBe('A sample project');
    });

    it('should throw NotFoundException when updating a non-existent project', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.update(999, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- softRemove ----------

  describe('softRemove', () => {
    it('should soft-delete the project', async () => {
      repo.findOneBy.mockResolvedValue(mockProject);
      repo.softRemove.mockResolvedValue({
        ...mockProject,
        deletedAt: now,
      });

      await expect(service.softRemove(1)).resolves.toBeUndefined();
      expect(repo.softRemove).toHaveBeenCalledWith(mockProject);
    });

    it('should throw NotFoundException when project does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.softRemove(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- findDeleted ----------

  describe('findDeleted', () => {
    it('should return soft-deleted projects', async () => {
      const deleted = { ...mockProject, deletedAt: now };
      const qb = {
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([deleted]),
      };
      repo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await service.findDeleted();
      expect(result).toEqual([deleted]);
    });
  });

  // ---------- restore ----------

  describe('restore', () => {
    it('should restore a soft-deleted project', async () => {
      repo.restore.mockResolvedValue({ affected: 1, raw: [], generatedMaps: [] });
      await expect(service.restore(1)).resolves.toBeUndefined();
    });

    it('should throw NotFoundException when no soft-deleted project found', async () => {
      repo.restore.mockResolvedValue({ affected: 0, raw: [], generatedMaps: [] });
      await expect(service.restore(999)).rejects.toThrow(NotFoundException);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { User } from './user.entity';
import { Role } from './role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const mockUser: User = {
  id: 1,
  username: 'jdoe',
  email: 'jdoe@example.com',
  fullName: 'John Doe',
  role: Role.DEVELOPER,
};

describe('UserService', () => {
  let service: UserService;
  let repo: jest.Mocked<Repository<User>>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            find: jest.fn(),
            findOneBy: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    repo = module.get(getRepositoryToken(User));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------- findAll ----------

  describe('findAll', () => {
    it('should return an array of users', async () => {
      repo.find.mockResolvedValue([mockUser]);
      const result = await service.findAll();
      expect(result).toEqual([mockUser]);
      expect(repo.find).toHaveBeenCalledTimes(1);
    });

    it('should return an empty array when no users exist', async () => {
      repo.find.mockResolvedValue([]);
      expect(await service.findAll()).toEqual([]);
    });
  });

  // ---------- findOne ----------

  describe('findOne', () => {
    it('should return a user when found', async () => {
      repo.findOneBy.mockResolvedValue(mockUser);
      expect(await service.findOne(1)).toEqual(mockUser);
    });

    it('should throw NotFoundException when user does not exist', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- create ----------

  describe('create', () => {
    const dto: CreateUserDto = {
      username: 'jdoe',
      email: 'jdoe@example.com',
      fullName: 'John Doe',
      role: Role.DEVELOPER,
    };

    it('should create and return a new user', async () => {
      repo.create.mockReturnValue(mockUser);
      repo.save.mockResolvedValue(mockUser);

      const result = await service.create(dto);
      expect(result).toEqual(mockUser);
      expect(repo.create).toHaveBeenCalledWith(dto);
      expect(repo.save).toHaveBeenCalledWith(mockUser);
    });

    it('should throw BadRequestException on duplicate username/email', async () => {
      repo.create.mockReturnValue(mockUser);
      repo.save.mockRejectedValue({ code: '23505' });

      await expect(service.create(dto)).rejects.toThrow(BadRequestException);
    });

    it('should re-throw unexpected database errors', async () => {
      repo.create.mockReturnValue(mockUser);
      const unexpected = new Error('connection lost');
      repo.save.mockRejectedValue(unexpected);

      await expect(service.create(dto)).rejects.toThrow('connection lost');
    });
  });

  // ---------- update ----------

  describe('update', () => {
    const dto: UpdateUserDto = { fullName: 'Jane Doe', role: Role.ADMIN };

    it('should update and return the modified user', async () => {
      const updated = { ...mockUser, ...dto };
      repo.findOneBy.mockResolvedValue({ ...mockUser });
      repo.save.mockResolvedValue(updated);

      const result = await service.update(1, dto);
      expect(result.fullName).toBe('Jane Doe');
      expect(result.role).toBe(Role.ADMIN);
    });

    it('should throw NotFoundException when updating a non-existent user', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.update(999, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- remove ----------

  describe('remove', () => {
    it('should remove the user without error', async () => {
      repo.findOneBy.mockResolvedValue(mockUser);
      repo.remove.mockResolvedValue(mockUser);

      await expect(service.remove(1)).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(mockUser);
    });

    it('should throw NotFoundException when deleting a non-existent user', async () => {
      repo.findOneBy.mockResolvedValue(null);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});

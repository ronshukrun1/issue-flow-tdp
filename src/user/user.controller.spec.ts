import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { UserController } from './user.controller';
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

describe('UserController', () => {
  let controller: UserController;
  let service: jest.Mocked<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            findAll: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get(UserService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------- findAll ----------

  describe('findAll', () => {
    it('should return all users', async () => {
      service.findAll.mockResolvedValue([mockUser]);
      expect(await controller.findAll()).toEqual([mockUser]);
    });
  });

  // ---------- findOne ----------

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      service.findOne.mockResolvedValue(mockUser);
      expect(await controller.findOne(1)).toEqual(mockUser);
    });

    it('should propagate NotFoundException from service', async () => {
      service.findOne.mockRejectedValue(
        new NotFoundException('User with ID 999 not found'),
      );
      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
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

    it('should create and return the new user', async () => {
      service.create.mockResolvedValue(mockUser);
      expect(await controller.create(dto)).toEqual(mockUser);
    });

    it('should propagate BadRequestException for duplicate data', async () => {
      service.create.mockRejectedValue(
        new BadRequestException(
          'A user with this username or email already exists',
        ),
      );
      await expect(controller.create(dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // ---------- update ----------

  describe('update', () => {
    const dto: UpdateUserDto = { fullName: 'Jane Doe', role: Role.ADMIN };

    it('should update and return the modified user', async () => {
      const updated = { ...mockUser, ...dto };
      service.update.mockResolvedValue(updated);
      expect(await controller.update(1, dto)).toEqual(updated);
    });

    it('should propagate NotFoundException for non-existent user', async () => {
      service.update.mockRejectedValue(
        new NotFoundException('User with ID 999 not found'),
      );
      await expect(controller.update(999, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- remove ----------

  describe('remove', () => {
    it('should delete the user without error', async () => {
      service.remove.mockResolvedValue(undefined);
      await expect(controller.remove(1)).resolves.toBeUndefined();
    });

    it('should propagate NotFoundException for non-existent user', async () => {
      service.remove.mockRejectedValue(
        new NotFoundException('User with ID 999 not found'),
      );
      await expect(controller.remove(999)).rejects.toThrow(NotFoundException);
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { Request } from 'express';
import { UserController } from './user.controller';
import { UserService } from './user.service';
import { CommentService } from '../comment/comment.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { User } from './user.entity';
import { Role } from './role.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const now = new Date();

const mockUser: User = {
  id: 1,
  username: 'jdoe',
  email: 'jdoe@example.com',
  fullName: 'John Doe',
  password: 'hashed',
  role: Role.DEVELOPER,
  createdAt: now,
  updatedAt: now,
};

const mockRequest = (userId: number): Request =>
  ({ user: { userId, username: 'admin', role: Role.ADMIN } }) as unknown as Request;

describe('UserController', () => {
  let controller: UserController;
  let service: jest.Mocked<UserService>;
  let commentService: jest.Mocked<CommentService>;
  let auditLogService: jest.Mocked<AuditLogService>;

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
        {
          provide: CommentService,
          useValue: { findMentionsForUser: jest.fn() },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    service = module.get(UserService);
    commentService = module.get(CommentService);
    auditLogService = module.get(AuditLogService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      service.findAll.mockResolvedValue([mockUser]);
      expect(await controller.findAll()).toEqual([mockUser]);
    });
  });

  describe('findOne', () => {
    it('should return a user by ID', async () => {
      service.findOne.mockResolvedValue(mockUser);
      expect(await controller.findOne(1)).toEqual(mockUser);
    });

    it('should propagate NotFoundException', async () => {
      service.findOne.mockRejectedValue(new NotFoundException());
      await expect(controller.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto: CreateUserDto = {
      username: 'jdoe',
      email: 'jdoe@example.com',
      fullName: 'John Doe',
      password: 'secret123',
      role: Role.DEVELOPER,
    };

    it('should create the user and log audit', async () => {
      service.create.mockResolvedValue(mockUser);
      const req = mockRequest(10);

      const result = await controller.create(dto, req);
      expect(result).toEqual(mockUser);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entityType: 'USER', entityId: 1, performedBy: 10 }),
      );
    });

    it('should propagate ConflictException', async () => {
      service.create.mockRejectedValue(new ConflictException());
      await expect(controller.create(dto, mockRequest(10))).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    const dto: UpdateUserDto = { fullName: 'Jane Doe', role: Role.ADMIN };

    it('should update the user and log audit', async () => {
      const updated: User = { ...mockUser, ...dto };
      service.update.mockResolvedValue(updated);
      const req = mockRequest(10);

      const result = await controller.update(1, dto, req);
      expect(result).toEqual(updated);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate NotFoundException', async () => {
      service.update.mockRejectedValue(new NotFoundException());
      await expect(controller.update(999, dto, mockRequest(10))).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete the user and log audit', async () => {
      service.remove.mockResolvedValue(undefined);
      const req = mockRequest(10);

      await expect(controller.remove(1, req)).resolves.toBeUndefined();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate NotFoundException', async () => {
      service.remove.mockRejectedValue(new NotFoundException());
      await expect(controller.remove(999, mockRequest(10))).rejects.toThrow(NotFoundException);
    });
  });

  describe('findMentions', () => {
    it('should return paginated mentions', async () => {
      const mentionsResult = { data: [], total: 0, page: 1 };
      commentService.findMentionsForUser.mockResolvedValue(mentionsResult);

      const result = await controller.findMentions(1, 1, 10);
      expect(result).toEqual(mentionsResult);
    });
  });
});

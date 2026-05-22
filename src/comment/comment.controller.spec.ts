import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { Comment } from './comment.entity';
import { User } from '../user/user.entity';
import { Role } from '../user/role.enum';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

const now = new Date();

const mockUser: User = {
  id: 1,
  username: 'alice',
  email: 'alice@example.com',
  fullName: 'Alice Smith',
  password: 'hashed',
  role: Role.DEVELOPER,
  createdAt: now,
  updatedAt: now,
};

const mockComment: Comment = {
  id: 1,
  ticketId: 1,
  ticket: undefined as never,
  authorId: 1,
  author: undefined as never,
  content: 'Hello @bob',
  mentionedUsers: [mockUser],
  version: 1,
  createdAt: now,
  updatedAt: now,
};

const mockRequest = (userId: number): Request =>
  ({ user: { userId, username: 'alice', role: Role.DEVELOPER } }) as unknown as Request;

describe('CommentController', () => {
  let controller: CommentController;
  let service: jest.Mocked<CommentService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CommentController],
      providers: [
        {
          provide: CommentService,
          useValue: {
            findByTicket: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
            remove: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: { log: jest.fn().mockResolvedValue({}) },
        },
      ],
    }).compile();

    controller = module.get<CommentController>(CommentController);
    service = module.get(CommentService);
    auditLogService = module.get(AuditLogService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findByTicket', () => {
    it('should return comments for a ticket', async () => {
      service.findByTicket.mockResolvedValue([mockComment]);
      expect(await controller.findByTicket(1)).toEqual([mockComment]);
    });

    it('should propagate NotFoundException', async () => {
      service.findByTicket.mockRejectedValue(new NotFoundException());
      await expect(controller.findByTicket(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    const dto: CreateCommentDto = { content: 'Hello @bob' };

    it('should extract userId from JWT, create comment, and log audit', async () => {
      service.create.mockResolvedValue(mockComment);
      const req = mockRequest(1);

      const result = await controller.create(1, dto, req);
      expect(result).toEqual(mockComment);
      expect(service.create).toHaveBeenCalledWith(1, 1, dto);
      expect(auditLogService.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', entityType: 'COMMENT' }),
      );
    });

    it('should propagate BadRequestException', async () => {
      service.create.mockRejectedValue(new BadRequestException());
      await expect(controller.create(1, dto, mockRequest(999))).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    const dto: UpdateCommentDto = { content: 'Updated @alice' };

    it('should update the comment and log audit', async () => {
      const updated = { ...mockComment, content: 'Updated @alice' };
      service.update.mockResolvedValue(updated);
      const req = mockRequest(1);

      const result = await controller.update(1, 1, dto, req);
      expect(result).toEqual(updated);
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate NotFoundException', async () => {
      service.update.mockRejectedValue(new NotFoundException());
      await expect(controller.update(1, 999, dto, mockRequest(1))).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete the comment and log audit', async () => {
      service.remove.mockResolvedValue(undefined);
      const req = mockRequest(1);

      await expect(controller.remove(1, 1, req)).resolves.toBeUndefined();
      expect(auditLogService.log).toHaveBeenCalled();
    });

    it('should propagate NotFoundException', async () => {
      service.remove.mockRejectedValue(new NotFoundException());
      await expect(controller.remove(1, 999, mockRequest(1))).rejects.toThrow(NotFoundException);
    });
  });
});

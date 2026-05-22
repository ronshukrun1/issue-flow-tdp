import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { Request } from 'express';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
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
  createdAt: now,
  updatedAt: now,
};

const mockRequest = (userId: number): Request =>
  ({ user: { userId, username: 'alice', role: Role.DEVELOPER } }) as unknown as Request;

describe('CommentController', () => {
  let controller: CommentController;
  let service: jest.Mocked<CommentService>;

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
      ],
    }).compile();

    controller = module.get<CommentController>(CommentController);
    service = module.get(CommentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------- findByTicket ----------

  describe('findByTicket', () => {
    it('should return comments for a ticket', async () => {
      service.findByTicket.mockResolvedValue([mockComment]);
      expect(await controller.findByTicket(1)).toEqual([mockComment]);
    });

    it('should propagate NotFoundException for invalid ticket', async () => {
      service.findByTicket.mockRejectedValue(
        new NotFoundException('Ticket with ID 999 not found'),
      );
      await expect(controller.findByTicket(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- create ----------

  describe('create', () => {
    const dto: CreateCommentDto = {
      content: 'Hello @bob',
    };

    it('should extract userId from JWT and create a comment', async () => {
      service.create.mockResolvedValue(mockComment);
      const req = mockRequest(1);

      const result = await controller.create(1, dto, req);
      expect(result).toEqual(mockComment);
      expect(service.create).toHaveBeenCalledWith(1, 1, dto);
    });

    it('should propagate BadRequestException for invalid author', async () => {
      service.create.mockRejectedValue(
        new BadRequestException('Author with ID 999 does not exist'),
      );
      const req = mockRequest(999);

      await expect(
        controller.create(1, dto, req),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ---------- update ----------

  describe('update', () => {
    const dto: UpdateCommentDto = { content: 'Updated @alice' };

    it('should update and return the modified comment', async () => {
      const updated = { ...mockComment, content: 'Updated @alice' };
      service.update.mockResolvedValue(updated);
      expect(await controller.update(1, 1, dto)).toEqual(updated);
    });

    it('should propagate NotFoundException', async () => {
      service.update.mockRejectedValue(
        new NotFoundException('Comment with ID 999 not found for ticket 1'),
      );
      await expect(controller.update(1, 999, dto)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- remove ----------

  describe('remove', () => {
    it('should delete the comment', async () => {
      service.remove.mockResolvedValue(undefined);
      await expect(controller.remove(1, 1)).resolves.toBeUndefined();
    });

    it('should propagate NotFoundException', async () => {
      service.remove.mockRejectedValue(
        new NotFoundException('Comment with ID 999 not found for ticket 1'),
      );
      await expect(controller.remove(1, 999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

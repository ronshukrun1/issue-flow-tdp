import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, OptimisticLockVersionMismatchError } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { CommentService } from './comment.service';
import { Comment } from './comment.entity';
import { TicketService } from '../ticket/ticket.service';
import { UserService } from '../user/user.service';
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

describe('CommentService', () => {
  let service: CommentService;
  let repo: jest.Mocked<Repository<Comment>>;
  let ticketService: jest.Mocked<TicketService>;
  let userService: jest.Mocked<UserService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CommentService,
        {
          provide: getRepositoryToken(Comment),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            findOneOrFail: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn(),
          },
        },
        {
          provide: TicketService,
          useValue: { findOne: jest.fn() },
        },
        {
          provide: UserService,
          useValue: {
            findOne: jest.fn(),
            findByUsernames: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<CommentService>(CommentService);
    repo = module.get(getRepositoryToken(Comment));
    ticketService = module.get(TicketService);
    userService = module.get(UserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------- findByTicket ----------

  describe('findByTicket', () => {
    it('should validate the ticket and return its comments', async () => {
      ticketService.findOne.mockResolvedValue({} as never);
      repo.find.mockResolvedValue([mockComment]);

      const result = await service.findByTicket(1);
      expect(ticketService.findOne).toHaveBeenCalledWith(1);
      expect(result).toEqual([mockComment]);
    });

    it('should propagate NotFoundException when ticket does not exist', async () => {
      ticketService.findOne.mockRejectedValue(
        new NotFoundException('Ticket with ID 999 not found'),
      );
      await expect(service.findByTicket(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ---------- create ----------

  describe('create', () => {
    const dto: CreateCommentDto = {
      content: 'Hello @bob',
    };
    const authorId = 1;

    it('should validate ticket and author, parse mentions, and create a comment', async () => {
      ticketService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockResolvedValue(mockUser);
      userService.findByUsernames.mockResolvedValue([mockUser]);
      repo.create.mockReturnValue(mockComment);
      repo.save.mockResolvedValue(mockComment);
      repo.findOneOrFail.mockResolvedValue(mockComment);

      const result = await service.create(1, authorId, dto);
      expect(result).toEqual(mockComment);
      expect(userService.findByUsernames).toHaveBeenCalledWith(['bob']);
    });

    it('should throw BadRequestException when author does not exist', async () => {
      ticketService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockRejectedValue(
        new NotFoundException('User with ID 999 not found'),
      );

      await expect(
        service.create(1, 999, dto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should handle content with no mentions', async () => {
      ticketService.findOne.mockResolvedValue({} as never);
      userService.findOne.mockResolvedValue(mockUser);
      userService.findByUsernames.mockResolvedValue([]);
      const noMentionComment = { ...mockComment, content: 'No mentions', mentionedUsers: [] };
      repo.create.mockReturnValue(noMentionComment);
      repo.save.mockResolvedValue(noMentionComment);
      repo.findOneOrFail.mockResolvedValue(noMentionComment);

      const result = await service.create(1, authorId, {
        content: 'No mentions',
      });
      expect(result.mentionedUsers).toEqual([]);
    });
  });

  // ---------- update ----------

  describe('update', () => {
    const dto: UpdateCommentDto = { content: 'Updated @alice' };

    it('should update content and re-evaluate mentions', async () => {
      const updated = { ...mockComment, content: 'Updated @alice' };
      repo.findOne.mockResolvedValue({ ...mockComment });
      userService.findByUsernames.mockResolvedValue([mockUser]);
      repo.save.mockResolvedValue(updated);
      repo.findOneOrFail.mockResolvedValue(updated);

      const result = await service.update(1, 1, dto);
      expect(result.content).toBe('Updated @alice');
      expect(userService.findByUsernames).toHaveBeenCalledWith(['alice']);
    });

    it('should throw NotFoundException when comment does not belong to ticket', async () => {
      repo.findOne.mockResolvedValue({ ...mockComment, ticketId: 99 });

      await expect(service.update(1, 1, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException when comment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.update(1, 999, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ConflictException on optimistic lock version mismatch', async () => {
      repo.findOne.mockResolvedValue({ ...mockComment });
      userService.findByUsernames.mockResolvedValue([mockUser]);
      repo.save.mockRejectedValue(
        new OptimisticLockVersionMismatchError('Comment', 1, 2),
      );

      await expect(service.update(1, 1, dto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ---------- remove ----------

  describe('remove', () => {
    it('should delete the comment', async () => {
      repo.findOne.mockResolvedValue(mockComment);
      repo.remove.mockResolvedValue(mockComment);

      await expect(service.remove(1, 1)).resolves.toBeUndefined();
      expect(repo.remove).toHaveBeenCalledWith(mockComment);
    });

    it('should throw NotFoundException when comment does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.remove(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ---------- findMentionsForUser ----------

  describe('findMentionsForUser', () => {
    it('should return paginated mentions for a user ordered by newest first', async () => {
      userService.findOne.mockResolvedValue(mockUser);
      const qb = {
        innerJoin: jest.fn().mockReturnThis(),
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[mockComment], 1]),
      };
      repo.createQueryBuilder.mockReturnValue(qb as never);

      const result = await service.findMentionsForUser(1, 1, 10);
      expect(result).toEqual({ data: [mockComment], total: 1, page: 1 });
      expect(qb.orderBy).toHaveBeenCalledWith('comment.createdAt', 'DESC');
    });

    it('should throw NotFoundException when user does not exist', async () => {
      userService.findOne.mockRejectedValue(
        new NotFoundException('User with ID 999 not found'),
      );
      await expect(service.findMentionsForUser(999)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  Repository,
  OptimisticLockVersionMismatchError,
  DataSource,
  QueryFailedError,
} from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CommentService, CommentMutationActor } from './comment.service';
import { Comment } from './comment.entity';
import { TicketService } from '../ticket/ticket.service';
import { UserService } from '../user/user.service';
import { User } from '../user/user.entity';
import { Role } from '../user/role.enum';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE } from '../common/pg-nowait-row-lock';

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

const actorAliceDeveloper: CommentMutationActor = {
  userId: 1,
  role: Role.DEVELOPER,
};
const actorAdminUser: CommentMutationActor = {
  userId: 99,
  role: Role.ADMIN,
};

describe('CommentService', () => {
  let service: CommentService;
  let repo: jest.Mocked<Repository<Comment>>;
  let ticketService: jest.Mocked<TicketService>;
  let userService: jest.Mocked<UserService>;
  let txnCommentManager: {
    findOne: jest.Mock;
    save: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    txnCommentManager = {
      findOne: jest.fn(),
      save: jest.fn(),
      remove: jest.fn(),
    };
    const queryRunnerStub = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      manager: txnCommentManager,
    };
    const dataSourceStub = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunnerStub),
    };

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
        {
          provide: DataSource,
          useValue: dataSourceStub,
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

    it('should update content and re-evaluate mentions when author is caller', async () => {
      const updated = { ...mockComment, content: 'Updated @alice' };
      txnCommentManager.findOne.mockResolvedValue({ ...mockComment });
      userService.findByUsernames.mockResolvedValue([mockUser]);
      txnCommentManager.save.mockResolvedValue(updated);
      repo.findOneOrFail.mockResolvedValue(updated);

      const result = await service.update(1, 1, dto, actorAliceDeveloper);
      expect(result.content).toBe('Updated @alice');
      expect(userService.findByUsernames).toHaveBeenCalledWith(['alice']);
    });

    it('should allow ADMIN to update another authors comment', async () => {
      const commentByBob = { ...mockComment, authorId: 2 };
      const updated = { ...commentByBob, content: 'Updated @alice' };
      txnCommentManager.findOne.mockResolvedValue({ ...commentByBob });
      userService.findByUsernames.mockResolvedValue([mockUser]);
      txnCommentManager.save.mockResolvedValue(updated);
      repo.findOneOrFail.mockResolvedValue(updated);

      const result = await service.update(1, 1, dto, actorAdminUser);
      expect(result.content).toBe('Updated @alice');
    });

    it('should throw ForbiddenException when DEVELOPER updates another authors comment', async () => {
      const commentByBob = { ...mockComment, authorId: 2 };
      txnCommentManager.findOne.mockResolvedValue({ ...commentByBob });

      await expect(
        service.update(1, 1, dto, actorAliceDeveloper),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.update(1, 1, dto, actorAliceDeveloper),
      ).rejects.toThrow('You are not allowed to modify this comment.');
      expect(userService.findByUsernames).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when comment does not belong to ticket', async () => {
      txnCommentManager.findOne.mockResolvedValue(null);

      await expect(
        service.update(1, 1, dto, actorAliceDeveloper),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when comment does not exist', async () => {
      txnCommentManager.findOne.mockResolvedValue(null);

      await expect(
        service.update(1, 999, dto, actorAliceDeveloper),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException on optimistic lock version mismatch', async () => {
      txnCommentManager.findOne.mockResolvedValue({ ...mockComment });
      userService.findByUsernames.mockResolvedValue([mockUser]);
      txnCommentManager.save.mockRejectedValue(
        new OptimisticLockVersionMismatchError('Comment', 1, 2),
      );

      await expect(
        service.update(1, 1, dto, actorAliceDeveloper),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw ConflictException when the pessimistic NOWAIT row lock cannot be acquired', async () => {
      txnCommentManager.findOne.mockRejectedValue(
        Object.assign(new QueryFailedError('', [], new Error()), {
          driverError: { code: '55P03' },
        }),
      );

      await expect(
        service.update(1, 1, dto, actorAliceDeveloper),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.update(1, 1, dto, actorAliceDeveloper),
      ).rejects.toThrow(PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE);
    });
  });

  // ---------- remove ----------

  describe('remove', () => {
    it('should lock, authorize, delete and commit when author is caller', async () => {
      txnCommentManager.findOne.mockResolvedValue(mockComment);
      txnCommentManager.remove.mockResolvedValue(mockComment);

      await expect(
        service.remove(1, 1, actorAliceDeveloper),
      ).resolves.toBeUndefined();
      expect(txnCommentManager.findOne).toHaveBeenCalledWith(Comment, {
        where: { id: 1, ticketId: 1 },
        lock: { mode: 'pessimistic_write', onLocked: 'nowait' },
      });
      expect(txnCommentManager.remove).toHaveBeenCalledWith(mockComment);
    });

    it('should allow ADMIN to delete another authors comment under row lock', async () => {
      const commentByBob = { ...mockComment, authorId: 2 };
      txnCommentManager.findOne.mockResolvedValue(commentByBob);
      txnCommentManager.remove.mockResolvedValue(commentByBob);

      await expect(
        service.remove(1, 1, actorAdminUser),
      ).resolves.toBeUndefined();
      expect(txnCommentManager.remove).toHaveBeenCalledWith(commentByBob);
    });

    it('should throw ForbiddenException when DEVELOPER deletes another authors comment', async () => {
      const commentByBob = { ...mockComment, authorId: 2 };
      txnCommentManager.findOne.mockResolvedValue(commentByBob);

      await expect(
        service.remove(1, 1, actorAliceDeveloper),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.remove(1, 1, actorAliceDeveloper),
      ).rejects.toThrow('You are not allowed to modify this comment.');
      expect(txnCommentManager.remove).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when comment does not exist', async () => {
      txnCommentManager.findOne.mockResolvedValue(null);
      await expect(
        service.remove(1, 999, actorAliceDeveloper),
      ).rejects.toThrow(NotFoundException);
      expect(txnCommentManager.remove).not.toHaveBeenCalled();
    });

    it('should throw ConflictException when the pessimistic NOWAIT lock cannot be acquired', async () => {
      txnCommentManager.findOne.mockRejectedValue(
        Object.assign(new QueryFailedError('', [], new Error()), {
          driverError: { code: '55P03' },
        }),
      );

      await expect(
        service.remove(1, 1, actorAliceDeveloper),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.remove(1, 1, actorAliceDeveloper),
      ).rejects.toThrow(PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE);
      expect(txnCommentManager.remove).not.toHaveBeenCalled();
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

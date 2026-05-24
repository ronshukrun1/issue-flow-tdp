import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  OptimisticLockVersionMismatchError,
  DataSource,
} from 'typeorm';
import { Comment } from './comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { extractMentions } from './mention.util';
import { TicketService } from '../ticket/ticket.service';
import { UserService } from '../user/user.service';
import { User } from '../user/user.entity';
import {
  PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE,
  isPgLockNotAvailableError,
} from '../common/pg-nowait-row-lock';
import { Role } from '../user/role.enum';

/** Authenticated caller context (`req.user`). */
export interface CommentMutationActor {
  userId: number;
  role: Role;
}

const COMMENT_MODIFY_FORBIDDEN_MESSAGE =
  'You are not allowed to modify this comment.';

/**
 * Encapsulates all business logic for comments and `@username` mentions.
 *
 * Every create/update operation automatically parses the comment body,
 * resolves mentioned usernames against the database, and persists the
 * `mentionedUsers` join-table entries.
 *
 * **`PATCH` / `DELETE` mutations:** `ADMIN` may edit or remove any comment;
 * `DEVELOPER` only their own (`comment.authorId`). Contention on the row
 * lock (**`55P03`**) maps to **409** with a generic retry message; forbidden
 * ownership maps to **403** with the fixed permission string.
 */
@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly ticketService: TicketService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Retrieves all comments for a given ticket, including populated
   * `mentionedUsers` (with `id`, `username`, `fullName` only).
   *
   * @param ticketId - The ticket whose comments to retrieve.
   * @returns An array of {@link Comment} entities.
   * @throws {NotFoundException} When the ticket does not exist.
   */
  async findByTicket(ticketId: number): Promise<Comment[]> {
    await this.ticketService.findOne(ticketId);
    const comments = await this.commentRepository.find({
      where: { ticketId },
      relations: ['mentionedUsers'],
    });
    return comments.map((c) => this.stripMentionFields(c));
  }

  /**
   * Creates a new comment, parsing and resolving `@username` mentions.
   *
   * The `authorId` is provided by the controller from the authenticated
   * user's JWT payload, preventing author spoofing.
   *
   * @param ticketId - The ticket to attach the comment to.
   * @param authorId - The authenticated user's ID (from JWT).
   * @param dto      - Validated creation payload.
   * @returns The newly persisted {@link Comment} entity (with mentionedUsers).
   * @throws {NotFoundException} When the ticket does not exist.
   * @throws {BadRequestException} When the author does not exist.
   */
  async create(
    ticketId: number,
    authorId: number,
    dto: CreateCommentDto,
  ): Promise<Comment> {
    await this.ticketService.findOne(ticketId);

    try {
      await this.userService.findOne(authorId);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(
          `Author with ID ${authorId} does not exist`,
        );
      }
      throw error;
    }

    const mentionedUsers = await this.resolveMentions(dto.content);

    const comment = this.commentRepository.create({
      ticketId,
      authorId,
      content: dto.content,
      mentionedUsers,
    });
    const saved = await this.commentRepository.save(comment);

    const result = await this.commentRepository.findOneOrFail({
      where: { id: saved.id },
      relations: ['mentionedUsers'],
    });
    return this.stripMentionFields(result);
  }

  /**
   * Updates a comment's content and re-evaluates its mentions.
   *
   * The pessimistic **`FOR UPDATE NOWAIT`** lock is taken on **`comments`** only
   * (no `mentionedUsers` join), avoiding PostgreSQL’s restriction against
   * locking the nullable side of an outer join. Mentions are resolved and the
   * join table updated after the lock is acquired, still inside the transaction.
   *
   * @param ticketId  - The parent ticket (used for ownership validation).
   * @param commentId - The comment to update.
   * @param dto       - Validated update payload.
   * @returns The updated {@link Comment} entity (with mentionedUsers).
   * @throws {NotFoundException} When the comment doesn't exist or doesn't belong to the ticket.
   * @throws {ForbiddenException} When a DEVELOPER attempts to mutate another author's comment.
   * @throws {ConflictException} On pessimistic **`NOWAIT`** contention (SQLSTATE `55P03`) or optimistic version mismatch.
   */
  async update(
    ticketId: number,
    commentId: number,
    dto: UpdateCommentDto,
    actor: CommentMutationActor,
  ): Promise<Comment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      let comment: Comment | null;
      try {
        comment = await queryRunner.manager.findOne(Comment, {
          where: { id: commentId, ticketId },
          lock: { mode: 'pessimistic_write', onLocked: 'nowait' },
        });
      } catch (error: unknown) {
        if (isPgLockNotAvailableError(error)) {
          throw new ConflictException(PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE);
        }
        throw error;
      }

      if (!comment) {
        throw new NotFoundException(
          `Comment with ID ${commentId} not found for ticket ${ticketId}`,
        );
      }

      CommentService.assertMayMutateComment(comment, actor);

      comment.content = dto.content;
      comment.mentionedUsers = await this.resolveMentions(dto.content);

      try {
        await queryRunner.manager.save(Comment, comment);
      } catch (error: unknown) {
        if (error instanceof OptimisticLockVersionMismatchError) {
          throw new ConflictException(
            'Comment was modified by another user. Please reload and retry.',
          );
        }
        throw error;
      }

      await queryRunner.commitTransaction();
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    const result = await this.commentRepository.findOneOrFail({
      where: { id: commentId },
      relations: ['mentionedUsers'],
    });
    return this.stripMentionFields(result);
  }

  /**
   * Permanently deletes a comment.
   *
   * Runs in a transaction with **`SELECT ... FOR UPDATE NOWAIT`** on the
   * comment row so concurrent **`PATCH`** / **`DELETE`** operations serialize.
   *
   * @param ticketId  - The parent ticket (used for ownership validation).
   * @param commentId - The comment to delete.
   * @throws {NotFoundException} When the comment doesn't exist or doesn't belong to the ticket.
   * @throws {ForbiddenException} When a DEVELOPER attempts to delete another author's comment.
   * @throws {ConflictException} When the pessimistic **`NOWAIT`** row lock cannot be acquired (SQLSTATE `55P03`).
   */
  async remove(
    ticketId: number,
    commentId: number,
    actor: CommentMutationActor,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      let comment: Comment | null;
      try {
        comment = await queryRunner.manager.findOne(Comment, {
          where: { id: commentId, ticketId },
          lock: { mode: 'pessimistic_write', onLocked: 'nowait' },
        });
      } catch (error: unknown) {
        if (isPgLockNotAvailableError(error)) {
          throw new ConflictException(PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE);
        }
        throw error;
      }

      if (!comment) {
        throw new NotFoundException(
          `Comment with ID ${commentId} not found for ticket ${ticketId}`,
        );
      }

      CommentService.assertMayMutateComment(comment, actor);

      await queryRunner.manager.remove(comment);
      await queryRunner.commitTransaction();
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Returns a paginated list of comments where the specified user
   * was mentioned via `@username`.
   *
   * @param userId   - The user whose mentions to retrieve.
   * @param page     - 1-based page number (defaults to 1).
   * @param pageSize - Number of results per page (defaults to 10).
   * @returns An object with `data`, `total`, and `page`.
   */
  async findMentionsForUser(
    userId: number,
    page = 1,
    pageSize = 10,
  ): Promise<{ data: Comment[]; total: number; page: number }> {
    await this.userService.findOne(userId);

    const [data, total] = await this.commentRepository
      .createQueryBuilder('comment')
      .innerJoin('comment.mentionedUsers', 'user', 'user.id = :userId', {
        userId,
      })
      .leftJoinAndSelect('comment.mentionedUsers', 'mentionedUser')
      .orderBy('comment.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
      .getManyAndCount();

    return { data: data.map((c) => this.stripMentionFields(c)), total, page };
  }

  /**
   * Strips `mentionedUsers` to only `{ id, username, fullName }` per
   * the README contract. Prevents email/role leakage in comment responses.
   */
  private stripMentionFields(comment: Comment): Comment {
    if (comment.mentionedUsers) {
      comment.mentionedUsers = comment.mentionedUsers.map(
        (u) => ({ id: u.id, username: u.username, fullName: u.fullName }) as User,
      );
    }
    return comment;
  }

  /**
   * Resolves `@username` tokens in comment content into {@link User} entities.
   */
  private async resolveMentions(content: string): Promise<User[]> {
    const usernames = extractMentions(content);
    if (usernames.length === 0) return [];
    return this.userService.findByUsernames(usernames);
  }

  /**
   * ADMIN may mutate any comment; DEVELOPER only where `comment.authorId === actor.userId`.
   */
  private static assertMayMutateComment(
    comment: Comment,
    actor: CommentMutationActor,
  ): void {
    if (actor.role === Role.ADMIN) return;
    if (comment.authorId !== actor.userId) {
      throw new ForbiddenException(COMMENT_MODIFY_FORBIDDEN_MESSAGE);
    }
  }
}

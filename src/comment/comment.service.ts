import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, OptimisticLockVersionMismatchError } from 'typeorm';
import { Comment } from './comment.entity';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { extractMentions } from './mention.util';
import { TicketService } from '../ticket/ticket.service';
import { UserService } from '../user/user.service';
import { User } from '../user/user.entity';

/**
 * Encapsulates all business logic for comments and `@username` mentions.
 *
 * Every create/update operation automatically parses the comment body,
 * resolves mentioned usernames against the database, and persists the
 * `mentionedUsers` join-table entries.
 */
@Injectable()
export class CommentService {
  constructor(
    @InjectRepository(Comment)
    private readonly commentRepository: Repository<Comment>,
    private readonly ticketService: TicketService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
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
    return this.commentRepository.find({
      where: { ticketId },
      relations: ['mentionedUsers'],
    });
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

    return this.commentRepository.findOneOrFail({
      where: { id: saved.id },
      relations: ['mentionedUsers'],
    });
  }

  /**
   * Updates a comment's content and re-evaluates its mentions.
   *
   * @param ticketId  - The parent ticket (used for ownership validation).
   * @param commentId - The comment to update.
   * @param dto       - Validated update payload.
   * @returns The updated {@link Comment} entity (with mentionedUsers).
   * @throws {NotFoundException} When the comment doesn't exist or doesn't belong to the ticket.
   */
  async update(
    ticketId: number,
    commentId: number,
    dto: UpdateCommentDto,
  ): Promise<Comment> {
    const comment = await this.findCommentForTicket(ticketId, commentId);

    comment.content = dto.content;
    comment.mentionedUsers = await this.resolveMentions(dto.content);

    try {
      await this.commentRepository.save(comment);
    } catch (error: unknown) {
      if (error instanceof OptimisticLockVersionMismatchError) {
        throw new ConflictException(
          'Comment was modified by another user. Please reload and retry.',
        );
      }
      throw error;
    }

    return this.commentRepository.findOneOrFail({
      where: { id: commentId },
      relations: ['mentionedUsers'],
    });
  }

  /**
   * Permanently deletes a comment.
   *
   * @param ticketId  - The parent ticket (used for ownership validation).
   * @param commentId - The comment to delete.
   * @throws {NotFoundException} When the comment doesn't exist or doesn't belong to the ticket.
   */
  async remove(ticketId: number, commentId: number): Promise<void> {
    const comment = await this.findCommentForTicket(ticketId, commentId);
    await this.commentRepository.remove(comment);
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

    return { data, total, page };
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
   * Fetches a comment and asserts it belongs to the given ticket.
   */
  private async findCommentForTicket(
    ticketId: number,
    commentId: number,
  ): Promise<Comment> {
    const comment = await this.commentRepository.findOne({
      where: { id: commentId },
      relations: ['mentionedUsers'],
    });
    if (!comment || comment.ticketId !== ticketId) {
      throw new NotFoundException(
        `Comment with ID ${commentId} not found for ticket ${ticketId}`,
      );
    }
    return comment;
  }
}

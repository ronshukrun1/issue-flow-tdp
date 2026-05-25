import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  ParseIntPipe,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ApiEmptyOk } from '../common/swagger/api-empty-ok.decorator';
import { Request } from 'express';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './comment.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';
import { Role } from '../user/role.enum';

/**
 * Handles HTTP requests for comments nested under `/tickets/:ticketId/comments`.
 *
 * `POST` accepts `authorId` in the body per the README contract, and verifies
 * it matches the authenticated user's JWT payload (`req.user.userId`) to
 * prevent author spoofing. State-changing actions are recorded in the audit log.
 *
 * For `PATCH` and `DELETE`, `ADMIN` may modify any comment; `DEVELOPER`
 * may modify only comments they authored (`authorId` matches JWT `userId`).
 * Concurrent **`PATCH`** and **`DELETE`** operations on the same comment
 * serialize via PostgreSQL `FOR UPDATE NOWAIT` and return **409** with a
 * generic retry message when the row lock is busy.
 */
@ApiTags('Comments')
@ApiBearerAuth()
@Controller('tickets/:ticketId/comments')
export class CommentController {
  constructor(
    private readonly commentService: CommentService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * `GET /tickets/:ticketId/comments` — returns all comments for a ticket,
   * including their populated `mentionedUsers`.
   */
  @Get()
  findByTicket(
    @Param('ticketId', ParseIntPipe) ticketId: number,
  ): Promise<Comment[]> {
    return this.commentService.findByTicket(ticketId);
  }

  /**
   * `POST /tickets/:ticketId/comments` — adds a comment and auto-parses
   * `@username` mentions. Body `authorId` must match the authenticated user.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async create(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: CreateCommentDto,
    @Req() req: Request,
  ): Promise<Comment> {
    const userId = (req.user as { userId: number }).userId;
    if (dto.authorId !== userId) {
      throw new BadRequestException(
        'authorId does not match the authenticated user',
      );
    }
    const comment = await this.commentService.create(ticketId, userId, dto);
    await this.auditLogService.log({
      action: AuditAction.CREATE,
      entityType: 'COMMENT',
      entityId: comment.id,
      performedBy: userId,
      actor: 'USER',
    });
    return comment;
  }

  /**
   * `PATCH /tickets/:ticketId/comments/:commentId` — updates a comment's
   * content and re-evaluates its mentions.
   */
  @Patch(':commentId')
  @HttpCode(HttpStatus.OK)
  @ApiEmptyOk()
  async update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() dto: UpdateCommentDto,
    @Req() req: Request,
  ): Promise<void> {
    const jwtUser = req.user as { userId: number; role: Role };
    await this.commentService.update(ticketId, commentId, dto, {
      userId: jwtUser.userId,
      role: jwtUser.role,
    });
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: 'COMMENT',
      entityId: commentId,
      performedBy: jwtUser.userId,
      actor: 'USER',
    });
  }

  /**
   * `DELETE /tickets/:ticketId/comments/:commentId` — permanently removes
   * a comment.
   */
  @Delete(':commentId')
  async remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Req() req: Request,
  ): Promise<void> {
    const jwtUser = req.user as { userId: number; role: Role };
    await this.commentService.remove(ticketId, commentId, {
      userId: jwtUser.userId,
      role: jwtUser.role,
    });
    await this.auditLogService.log({
      action: AuditAction.DELETE,
      entityType: 'COMMENT',
      entityId: commentId,
      performedBy: jwtUser.userId,
      actor: 'USER',
    });
  }
}

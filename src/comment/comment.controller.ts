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
} from '@nestjs/common';
import { Request } from 'express';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { Comment } from './comment.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';

/**
 * Handles HTTP requests for comments nested under `/tickets/:ticketId/comments`.
 *
 * The authenticated user's ID is extracted from the JWT payload
 * (`req.user.userId`) rather than accepted from the request body,
 * preventing author spoofing. State-changing actions are recorded
 * in the audit log.
 */
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
   * `@username` mentions. The author is the authenticated user.
   */
  @Post()
  async create(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: CreateCommentDto,
    @Req() req: Request,
  ): Promise<Comment> {
    const userId = (req.user as { userId: number }).userId;
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
  async update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() dto: UpdateCommentDto,
    @Req() req: Request,
  ): Promise<Comment> {
    const comment = await this.commentService.update(ticketId, commentId, dto);
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: 'COMMENT',
      entityId: commentId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
    return comment;
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
    await this.commentService.remove(ticketId, commentId);
    await this.auditLogService.log({
      action: AuditAction.DELETE,
      entityType: 'COMMENT',
      entityId: commentId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }
}

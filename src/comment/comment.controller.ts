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

/**
 * Handles HTTP requests for comments nested under `/tickets/:ticketId/comments`.
 *
 * The authenticated user's ID is extracted from the JWT payload
 * (`req.user.userId`) rather than accepted from the request body,
 * preventing author spoofing.
 */
@Controller('tickets/:ticketId/comments')
export class CommentController {
  constructor(private readonly commentService: CommentService) {}

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
  create(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: CreateCommentDto,
    @Req() req: Request,
  ): Promise<Comment> {
    const userId = (req.user as { userId: number }).userId;
    return this.commentService.create(ticketId, userId, dto);
  }

  /**
   * `PATCH /tickets/:ticketId/comments/:commentId` — updates a comment's
   * content and re-evaluates its mentions.
   */
  @Patch(':commentId')
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
    @Body() dto: UpdateCommentDto,
  ): Promise<Comment> {
    return this.commentService.update(ticketId, commentId, dto);
  }

  /**
   * `DELETE /tickets/:ticketId/comments/:commentId` — permanently removes
   * a comment.
   */
  @Delete(':commentId')
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('commentId', ParseIntPipe) commentId: number,
  ): Promise<void> {
    return this.commentService.remove(ticketId, commentId);
  }
}

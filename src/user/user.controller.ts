import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';
import { CommentService } from '../comment/comment.service';
import { Comment } from '../comment/comment.entity';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';

/**
 * Handles all HTTP requests for the `/users` resource.
 *
 * Each endpoint maps directly to the Users API contract defined in
 * the project README. All endpoints are protected by the global
 * `JwtAuthGuard` and accessible to any authenticated user.
 */
@ApiTags('Users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly commentService: CommentService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * `GET /users` — returns every registered user.
   */
  @Get()
  findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  /**
   * `GET /users/:userId` — returns a single user by ID.
   */
  @Get(':userId')
  findOne(@Param('userId', ParseIntPipe) userId: number): Promise<User> {
    return this.userService.findOne(userId);
  }

  /**
   * `GET /users/:userId/mentions` — returns a paginated list of comments
   * where the user was `@mentioned`.
   */
  @Get(':userId/mentions')
  findMentions(
    @Param('userId', ParseIntPipe) userId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(10), ParseIntPipe) pageSize: number,
  ): Promise<{ data: Comment[]; total: number; page: number }> {
    return this.commentService.findMentionsForUser(userId, page, pageSize);
  }

  /**
   * `POST /users` — creates (registers) a new user.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() dto: CreateUserDto,
    @Req() req: Request,
  ): Promise<User> {
    const user = await this.userService.create(dto);
    await this.auditLogService.log({
      action: AuditAction.CREATE,
      entityType: 'USER',
      entityId: user.id,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
    return user;
  }

  /**
   * `POST /users/update/:userId` — updates mutable fields of an existing user.
   */
  @Post('update/:userId')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ): Promise<User> {
    const user = await this.userService.update(userId, dto);
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: 'USER',
      entityId: userId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
    return user;
  }

  /**
   * `DELETE /users/:userId` — permanently removes a user.
   */
  @Delete(':userId')
  async remove(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: Request,
  ): Promise<void> {
    await this.userService.remove(userId);
    await this.auditLogService.log({
      action: AuditAction.DELETE,
      entityType: 'USER',
      entityId: userId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }
}

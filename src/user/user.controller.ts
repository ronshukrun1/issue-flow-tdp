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
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from './role.enum';

/**
 * Handles all HTTP requests for the `/users` resource.
 *
 * Each endpoint maps directly to the Users API contract defined in
 * the project README. All routes require a valid JWT (`JwtAuthGuard`).
 * **`POST /users`** and **`DELETE /users/:userId`** additionally require **`ADMIN`** via **`@Roles`**.
 * **`POST /users/update/:userId`**: **`ADMIN`** may edit any user's **`fullName`** / **`role`**;
 * other roles may edit **only their own** **`fullName`** (body **must not** contain **`role`**).
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
   * `POST /users` — creates a new user (administrator-only, TDP).
   *
   * Requires **`ADMIN`**. Body **must** include **`password`**; only the
   * seeded `admin` account is created outside this endpoint.
   */
  @Roles(Role.ADMIN)
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
   * `POST /users/update/:userId` — updates **`fullName`** and/or **`role`** (README contract).
   *
   * **`ADMIN`**: may update either field for **any** user. **Non-admins**: may update **only own**
   * **`fullName`**; **`role`** in the JSON body yields **403** with **`UserService`** messages.
   */
  @Post('update/:userId')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
    @Req() req: Request,
  ): Promise<void> {
    const { userId: actorUserId, role: actorRole } = req.user as {
      userId: number;
      role: Role;
    };
    const actor = { userId: actorUserId, role: actorRole };
    const body = req.body as Record<string, unknown>;
    const requestBodyIncludesRole =
      typeof body === 'object' &&
      body !== null &&
      Object.prototype.hasOwnProperty.call(body, 'role');

    await this.userService.update(
      userId,
      dto,
      actor,
      requestBodyIncludesRole,
    );
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: 'USER',
      entityId: userId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }

  /**
   * `DELETE /users/:userId` — permanently removes a user (administrator-only, TDP).
   *
   * Requires **`ADMIN`**; mirrors **`POST /users`** onboarding rules.
   */
  @Roles(Role.ADMIN)
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

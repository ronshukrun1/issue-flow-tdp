import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User } from './user.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from './role.enum';

/**
 * Handles all HTTP requests for the `/users` resource.
 *
 * Each endpoint maps directly to the Users API contract defined in
 * the project README. User creation and destructive operations are
 * restricted to administrators.
 */
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  /**
   * `GET /users` — returns every registered user.
   */
  @Get()
  findAll(): Promise<User[]> {
    return this.userService.findAll();
  }

  /**
   * `GET /users/:userId` — returns a single user by ID.
   *
   * @param userId - Path parameter parsed as an integer.
   */
  @Get(':userId')
  findOne(@Param('userId', ParseIntPipe) userId: number): Promise<User> {
    return this.userService.findOne(userId);
  }

  /**
   * `POST /users` — creates (registers) a new user.
   *
   * Restricted to ADMIN users to prevent anonymous privilege escalation.
   *
   * The request body is validated against {@link CreateUserDto}.
   */
  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateUserDto): Promise<User> {
    return this.userService.create(dto);
  }

  /**
   * `POST /users/update/:userId` — updates mutable fields of an existing user.
   *
   * Restricted to ADMIN users.
   *
   * The request body is validated against {@link UpdateUserDto}.
   */
  @Roles(Role.ADMIN)
  @Post('update/:userId')
  update(
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
  ): Promise<User> {
    return this.userService.update(userId, dto);
  }

  /**
   * `DELETE /users/:userId` — permanently removes a user.
   *
   * Restricted to ADMIN users.
   */
  @Roles(Role.ADMIN)
  @Delete(':userId')
  remove(@Param('userId', ParseIntPipe) userId: number): Promise<void> {
    return this.userService.remove(userId);
  }
}

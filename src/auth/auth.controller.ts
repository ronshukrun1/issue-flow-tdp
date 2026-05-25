import {
  Controller,
  Post,
  Get,
  Body,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOkResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { LoginResponseDto } from './dto/login-response.dto';
import { Public } from '../common/decorators/public.decorator';
import { ApiEmptyOk } from '../common/swagger/api-empty-ok.decorator';

/**
 * Handles authentication-related HTTP endpoints.
 */
@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * `POST /auth/login` — authenticates a user and returns a JWT.
   *
   * This endpoint is public (no token required).
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: LoginResponseDto })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * `GET /auth/me` — returns the authenticated user's profile.
   *
   * Requires a valid JWT in the `Authorization: Bearer <token>` header.
   */
  @Get('me')
  getProfile(@Req() req: Request) {
    return this.authService.getProfile((req.user as { userId: number }).userId);
  }

  /**
   * `POST /auth/logout` — invalidates the current JWT token.
   *
   * Extracts the Bearer token from the `Authorization` header and
   * adds it to the server-side revocation registry (TDP 2.2).
   */
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiEmptyOk()
  logout(@Req() req: Request): void {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      this.authService.revokeToken(token);
    }
  }
}

import { Controller, Post, Get, Body, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { Public } from '../common/decorators/public.decorator';

/**
 * Handles authentication-related HTTP endpoints.
 */
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
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * `GET /auth/me` — returns the authenticated user's profile.
   *
   * Requires a valid JWT in the `Authorization: Bearer <token>` header.
   */
  @Get('me')
  getProfile(@Request() req: { user: { userId: number } }) {
    return this.authService.getProfile(req.user.userId);
  }

  /**
   * `POST /auth/logout` — client-side logout acknowledgement.
   *
   * With stateless JWT the server cannot revoke tokens. The client
   * is expected to discard the token. This endpoint exists to satisfy
   * the API contract and can later be extended with a token deny-list.
   */
  @Post('logout')
  logout() {
    return { message: 'Logged out successfully' };
  }
}

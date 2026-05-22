import { Inject, Injectable, UnauthorizedException, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { Role } from '../../user/role.enum';
import { AuthService } from '../auth.service';

/**
 * Passport strategy that validates JWT Bearer tokens from the
 * `Authorization` header.
 *
 * On success the decoded payload is attached to `request.user`.
 * Revoked tokens (via `POST /auth/logout`) are rejected with a 401.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  /**
   * Called by Passport after the token signature is verified.
   * Checks the revocation registry before allowing access.
   *
   * @param req     - The incoming HTTP request (passed via `passReqToCallback`).
   * @param payload - The decoded JWT claims.
   * @returns The user context attached to the request object.
   * @throws {UnauthorizedException} When the token has been revoked.
   */
  validate(
    req: Request,
    payload: JwtPayload,
  ): { userId: number; username: string; role: Role } {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (this.authService.isTokenRevoked(token)) {
        throw new UnauthorizedException('Token has been revoked');
      }
    }

    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}

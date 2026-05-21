import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { Role } from '../../user/role.enum';

/**
 * Passport strategy that validates JWT Bearer tokens from the
 * `Authorization` header.
 *
 * On success the decoded payload is attached to `request.user`.
 * Uses `getOrThrow` so the app crashes at startup if `JWT_SECRET`
 * is not configured.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Called by Passport after the token signature is verified.
   *
   * @param payload - The decoded JWT claims.
   * @returns The user context attached to the request object.
   */
  validate(payload: JwtPayload): {
    userId: number;
    username: string;
    role: Role;
  } {
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}

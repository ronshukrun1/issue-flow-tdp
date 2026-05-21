import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

/**
 * Handles credential validation and JWT token lifecycle.
 *
 * Reads `JWT_EXPIRATION` from the environment so the `expiresIn`
 * value in the login response always matches the actual token TTL.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validates username/password credentials and returns a signed JWT.
   *
   * @param dto - Login credentials.
   * @returns An object containing the signed `accessToken`.
   * @throws {UnauthorizedException} When credentials are invalid.
   */
  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; tokenType: string; expiresIn: number }> {
    const user = await this.userService.findByUsernameWithPassword(
      dto.username,
    );

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);
    const expiresIn = this.configService.get<number>('JWT_EXPIRATION', 3600);

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
    };
  }

  /**
   * Returns the full user profile for the currently authenticated user.
   *
   * @param userId - Extracted from the JWT payload (`request.user.userId`).
   * @returns The {@link User} entity (password excluded).
   */
  async getProfile(userId: number) {
    return this.userService.findOne(userId);
  }
}

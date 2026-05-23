import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from '../user/user.entity';
import { Role } from '../user/role.enum';
import { LoginDto } from './dto/login.dto';

const now = new Date();

const mockProfile: Omit<User, 'password'> = {
  id: 1,
  username: 'jdoe',
  email: 'jdoe@example.com',
  fullName: 'John Doe',
  role: Role.DEVELOPER,
  createdAt: now,
  updatedAt: now,
};

const mockRequest = (token?: string): Request =>
  ({
    headers: { authorization: token ? `Bearer ${token}` : undefined },
    user: { userId: 1, username: 'jdoe', role: Role.DEVELOPER },
  }) as unknown as Request;

describe('AuthController', () => {
  let controller: AuthController;
  let service: jest.Mocked<AuthService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(),
            getProfile: jest.fn(),
            revokeToken: jest.fn(),
            isTokenRevoked: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    service = module.get(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ---------- login ----------

  describe('login', () => {
    const dto: LoginDto = { username: 'jdoe', password: 'secret123' };

    it('should return an access token object', async () => {
      const tokenResponse = {
        accessToken: 'jwt-token',
        tokenType: 'Bearer' as const,
        expiresIn: 3600,
      };
      service.login.mockResolvedValue(tokenResponse);

      expect(await controller.login(dto)).toEqual(tokenResponse);
    });

    it('should propagate UnauthorizedException', async () => {
      service.login.mockRejectedValue(
        new UnauthorizedException('Invalid username or password'),
      );

      await expect(controller.login(dto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ---------- getProfile ----------

  describe('getProfile', () => {
    it('should return the authenticated user profile', async () => {
      service.getProfile.mockResolvedValue(mockProfile as User);

      const req = mockRequest('some-token');
      expect(await controller.getProfile(req)).toEqual(mockProfile);
      expect(service.getProfile).toHaveBeenCalledWith(1);
    });
  });

  // ---------- logout ----------

  describe('logout', () => {
    it('should extract the token and revoke it', () => {
      const req = mockRequest('my-jwt-token');
      const result = controller.logout(req);
      expect(service.revokeToken).toHaveBeenCalledWith('my-jwt-token');
      expect(result).toBeUndefined();
    });

    it('should handle missing authorization header gracefully', () => {
      const req = { headers: {}, user: { userId: 1 } } as unknown as Request;
      const result = controller.logout(req);
      expect(service.revokeToken).not.toHaveBeenCalled();
      expect(result).toBeUndefined();
    });
  });
});

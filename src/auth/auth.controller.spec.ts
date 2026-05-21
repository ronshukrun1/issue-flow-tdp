import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
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

      const req = { user: { userId: 1 } };
      expect(await controller.getProfile(req)).toEqual(mockProfile);
      expect(service.getProfile).toHaveBeenCalledWith(1);
    });
  });

  // ---------- logout ----------

  describe('logout', () => {
    it('should return a success message', () => {
      expect(controller.logout()).toEqual({
        message: 'Logged out successfully',
      });
    });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UserService } from '../user/user.service';
import { User } from '../user/user.entity';
import { Role } from '../user/role.enum';
import { LoginDto } from './dto/login.dto';

jest.mock('bcrypt');

const now = new Date();

const mockUser: User = {
  id: 1,
  username: 'jdoe',
  email: 'jdoe@example.com',
  fullName: 'John Doe',
  password: '$2b$10$hashedpassword',
  role: Role.DEVELOPER,
  createdAt: now,
  updatedAt: now,
};

describe('AuthService', () => {
  let service: AuthService;
  let userService: jest.Mocked<UserService>;
  let jwtService: jest.Mocked<JwtService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: UserService,
          useValue: {
            findByUsernameWithPassword: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(3600),
            getOrThrow: jest.fn().mockReturnValue('test-secret'),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userService = module.get(UserService);
    jwtService = module.get(JwtService);
    configService = module.get(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ---------- login ----------

  describe('login', () => {
    const dto: LoginDto = { username: 'jdoe', password: 'secret123' };

    it('should return an access token with dynamic expiresIn', async () => {
      userService.findByUsernameWithPassword.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.sign.mockReturnValue('signed-jwt-token');
      configService.get.mockReturnValue(7200);

      const result = await service.login(dto);
      expect(result).toEqual({
        accessToken: 'signed-jwt-token',
        tokenType: 'Bearer',
        expiresIn: 7200,
      });
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: 1,
        username: 'jdoe',
        role: Role.DEVELOPER,
      });
    });

    it('should throw UnauthorizedException when user not found', async () => {
      userService.findByUsernameWithPassword.mockResolvedValue(null);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for wrong password', async () => {
      userService.findByUsernameWithPassword.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(dto)).rejects.toThrow(UnauthorizedException);
    });
  });

  // ---------- token revocation ----------

  describe('revokeToken / isTokenRevoked', () => {
    it('should mark a token as revoked', () => {
      expect(service.isTokenRevoked('token-abc')).toBe(false);
      service.revokeToken('token-abc');
      expect(service.isTokenRevoked('token-abc')).toBe(true);
    });

    it('should return false for tokens that were never revoked', () => {
      expect(service.isTokenRevoked('unknown-token')).toBe(false);
    });
  });

  // ---------- getProfile ----------

  describe('getProfile', () => {
    it('should return the user profile for a valid userId', async () => {
      const profile = { ...mockUser };
      delete (profile as Partial<User>).password;
      userService.findOne.mockResolvedValue(profile as User);

      const result = await service.getProfile(1);
      expect(result).toEqual(profile);
      expect(userService.findOne).toHaveBeenCalledWith(1);
    });

    it('should propagate NotFoundException for unknown userId', async () => {
      userService.findOne.mockRejectedValue(
        new NotFoundException('User with ID 999 not found'),
      );

      await expect(service.getProfile(999)).rejects.toThrow(NotFoundException);
    });
  });
});

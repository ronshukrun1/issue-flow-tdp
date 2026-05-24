import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';
import { AuthService } from '../auth/auth.service';
import { User } from './user.entity';
import { Role } from './role.enum';
import { CreateUserDto } from './dto/create-user.dto';

/**
 * bcrypt is not mocked — verifies that hashing in {@link UserService.create}
 * matches {@link AuthService.login} comparisons for admin-created accounts.
 */
describe('UserService.create → AuthService.login password flow', () => {
  let userService: UserService;
  let authService: AuthService;

  /** Last entity passed to `save` including bcrypt hash */
  let savedEntity: User;

  const qb = {
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(() => Promise.resolve(savedEntity)),
  };

  const repository = {
    find: jest.fn(),
    findOneBy: jest.fn(),
    findOneByOrFail: jest.fn(),
    count: jest.fn(),
    create: jest.fn((data: Partial<User>) => ({ id: 99, ...(data as object) }) as User),
    save: jest.fn(async (entity: User) => {
      savedEntity = entity;
      return entity;
    }),
    remove: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: repository,
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('signed-token') },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(3600) },
        },
        {
          provide: DataSource,
          useValue: { transaction: jest.fn() },
        },
      ],
    }).compile();

    userService = moduleRef.get(UserService);
    authService = moduleRef.get(AuthService);

    repository.findOneByOrFail.mockImplementation(
      async ({ id }: { id: number }) => {
        const { password: _ignored, ...rest } = savedEntity;
        return {
          ...(rest as User),
          id,
          password: undefined as never,
        } as User;
      },
    );
  });

  it('allows login using the plaintext password supplied at create time', async () => {
    const dto: CreateUserDto = {
      username: 'flowuser',
      email: 'flow@example.com',
      fullName: 'Flow User',
      password: 'createPass9chars',
      role: Role.DEVELOPER,
    };

    await userService.create(dto);
    expect(savedEntity.password).toBeTruthy();
    expect(savedEntity.password).not.toBe(dto.password);
    const compareOk = await bcrypt.compare(dto.password, savedEntity.password);
    expect(compareOk).toBe(true);

    const result = await authService.login({
      username: dto.username,
      password: dto.password,
    });
    expect(result.accessToken).toBe('signed-token');
  });
});

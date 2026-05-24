import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './dto/create-user.dto';
import { Role } from './role.enum';

const basePayload = (): Record<string, unknown> => ({
  username: 'jdoe',
  email: 'jdoe@example.com',
  fullName: 'John Doe',
  password: 'Secret123!',
  role: Role.DEVELOPER,
});

describe('CreateUserDto', () => {
  async function validateDto(plain: Record<string, unknown>) {
    const dto = plainToInstance(CreateUserDto, plain);
    return validate(dto);
  }

  it('accepts payload with minimum valid password length', async () => {
    const errors = await validateDto(basePayload());
    expect(errors).toHaveLength(0);
  });

  it('rejects missing password with clear message', async () => {
    const plain = basePayload();
    delete plain.password;
    const errors = await validateDto(plain);
    const pwd = errors.find((e) => e.property === 'password');
    expect(pwd).toBeDefined();
    expect(pwd!.constraints?.isNotEmpty).toContain(
      'password is required to create a new user',
    );
  });

  it('rejects empty password after trim', async () => {
    const errors = await validateDto({ ...basePayload(), password: '   ' });
    const pwd = errors.find((e) => e.property === 'password');
    expect(pwd?.constraints?.isNotEmpty).toBeDefined();
  });

  it('rejects password shorter than 8 characters', async () => {
    const errors = await validateDto({
      ...basePayload(),
      password: 'short',
    });
    const pwd = errors.find((e) => e.property === 'password');
    expect(pwd?.constraints?.minLength).toContain('8 characters');
  });
});

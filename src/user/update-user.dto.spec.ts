import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdateUserDto } from './dto/update-user.dto';
import { Role } from './role.enum';

describe('UpdateUserDto', () => {
  async function validateDto(plain: Record<string, unknown>) {
    const dto = plainToInstance(UpdateUserDto, plain);
    return validate(dto);
  }

  it('accepts valid admin role and fullName', async () => {
    const errors = await validateDto({
      fullName: 'Jane Doe',
      role: Role.ADMIN,
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid role value with IsEnum message (before service RBAC)', async () => {
    const errors = await validateDto({
      fullName: 'Ok',
      role: 'NOT_A_ROLE',
    });
    const roleErr = errors.find((e) => e.property === 'role');
    expect(roleErr).toBeDefined();
    expect(roleErr!.constraints?.isEnum).toContain('ADMIN');
    expect(roleErr!.constraints?.isEnum).toContain('DEVELOPER');
  });
});

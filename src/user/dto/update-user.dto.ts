import {
  IsString,
  IsEnum,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '../role.enum';

/**
 * Data-transfer object for updating an existing user.
 *
 * Only `fullName` and `role` may be changed after creation.
 * Both fields are optional so a client can send a partial update.
 */
export class UpdateUserDto {
  /** Updated display name (1–100 characters, trimmed). */
  @IsOptional()
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  fullName?: string;

  /** Updated role — must be either `ADMIN` or `DEVELOPER`. */
  @IsOptional()
  @IsEnum(Role, { message: 'role must be one of: ADMIN, DEVELOPER' })
  role?: Role;
}

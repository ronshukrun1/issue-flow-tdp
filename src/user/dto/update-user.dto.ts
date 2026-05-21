import { IsString, IsEnum, IsOptional } from 'class-validator';
import { Role } from '../role.enum';

/**
 * Data-transfer object for updating an existing user.
 *
 * Only `fullName` and `role` may be changed after creation.
 * Both fields are optional so a client can send a partial update.
 */
export class UpdateUserDto {
  /** Updated display name. */
  @IsOptional()
  @IsString()
  fullName?: string;

  /** Updated role — must be either `ADMIN` or `DEVELOPER`. */
  @IsOptional()
  @IsEnum(Role, { message: 'role must be one of: ADMIN, DEVELOPER' })
  role?: Role;
}

import { IsString, IsEmail, IsEnum, IsNotEmpty } from 'class-validator';
import { Role } from '../role.enum';

/**
 * Data-transfer object for creating a new user.
 *
 * All fields are mandatory. The `role` field is validated against
 * the {@link Role} enum to prevent invalid values from reaching
 * the database.
 */
export class CreateUserDto {
  /** Unique login handle for the user. */
  @IsString()
  @IsNotEmpty()
  username: string;

  /** Unique contact email address. */
  @IsEmail()
  @IsNotEmpty()
  email: string;

  /** Human-readable full name of the user. */
  @IsString()
  @IsNotEmpty()
  fullName: string;

  /** Must be either `ADMIN` or `DEVELOPER`. */
  @IsEnum(Role, { message: 'role must be one of: ADMIN, DEVELOPER' })
  role: Role;
}

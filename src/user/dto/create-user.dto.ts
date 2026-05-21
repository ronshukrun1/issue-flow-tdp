import {
  IsString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Role } from '../role.enum';

/**
 * Data-transfer object for creating a new user.
 *
 * All fields are mandatory. The `role` field is validated against
 * the {@link Role} enum to prevent invalid values from reaching
 * the database.
 */
export class CreateUserDto {
  /** Unique login handle for the user (2–50 characters, trimmed). */
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  username!: string;

  /** Unique contact email address (lowercased, max 255 characters). */
  @Transform(({ value }: { value: string }) => value?.trim().toLowerCase())
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  email!: string;

  /** Human-readable full name (1–100 characters, trimmed). */
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  fullName!: string;

  /** Must be either `ADMIN` or `DEVELOPER`. */
  @IsEnum(Role, { message: 'role must be one of: ADMIN, DEVELOPER' })
  role!: Role;
}

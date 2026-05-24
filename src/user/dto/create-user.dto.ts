import {
  IsString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../role.enum';

/**
 * Data-transfer object for creating a new user.
 *
 * **`password`** is **required**: only administrators may call `POST /users`,
 * and each new account must include an explicit plaintext password which the
 * service bcrypt-hashes before storage. Responses never include the hash.
 */
export class CreateUserDto {
  /** Unique login handle for the user (2-50 characters, trimmed). */
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

  /** Human-readable full name (1-100 characters, trimmed). */
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  fullName!: string;

  /** Plain-text password (minimum 8 characters before/after trim). */
  @ApiProperty({
    minLength: 8,
    maxLength: 128,
    description:
      'Required. Stored as bcrypt hash; never returned in API responses.',
  })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty({
    message: 'password is required to create a new user',
  })
  @IsString()
  @MinLength(8, {
    message: 'password must be at least 8 characters long',
  })
  @MaxLength(128)
  password!: string;

  /** Must be either `ADMIN` or `DEVELOPER`. */
  @ApiProperty({ enum: Role })
  @IsEnum(Role, { message: 'role must be one of: ADMIN, DEVELOPER' })
  role!: Role;
}

import {
  IsString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '../role.enum';

/**
 * Data-transfer object for creating a new user.
 *
 * The `password` field is optional. When omitted the service layer
 * falls back to the default password `'secret'` and hashes it
 * before storage.
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

  /** Plain-text password (minimum 6 characters). Defaults to 'secret' if omitted. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(6)
  @MaxLength(128)
  password?: string;

  /** Must be either `ADMIN` or `DEVELOPER`. */
  @ApiProperty({ enum: Role })
  @IsEnum(Role, { message: 'role must be one of: ADMIN, DEVELOPER' })
  role!: Role;
}

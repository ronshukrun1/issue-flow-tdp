import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';

/**
 * Data-transfer object for the login request.
 *
 * Both `username` and `password` are mandatory.
 */
export class LoginDto {
  /** The user's unique login handle. */
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  username!: string;

  /** The user's plain-text password. */
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @MaxLength(128)
  password!: string;
}

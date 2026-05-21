import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Data-transfer object for creating a new project.
 *
 * `name` and `ownerId` are required. `description` is optional.
 */
export class CreateProjectDto {
  /** Project name (1–150 characters, trimmed). */
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(150)
  name!: string;

  /** Optional project description (max 2000 characters, trimmed). */
  @IsOptional()
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @MaxLength(2000)
  description?: string;

  /** The ID of the user who owns this project. */
  @IsInt()
  ownerId!: number;
}

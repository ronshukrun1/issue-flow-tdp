import { IsString, IsOptional, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Data-transfer object for updating an existing project.
 *
 * Only `name` and `description` may be changed. Both are optional
 * so a client can send a partial update.
 */
export class UpdateProjectDto {
  /** Updated project name (1–150 characters, trimmed). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(150)
  name?: string;

  /** Updated project description (max 2000 characters, trimmed). */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MaxLength(2000)
  description?: string;
}

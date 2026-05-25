import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Data-transfer object for updating an existing comment's content.
 *
 * On update the mention list is re-evaluated automatically.
 */
export class UpdateCommentDto {
  /** Updated comment body (1-5000 characters). May contain `@username` mentions. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}

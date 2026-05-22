import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsInt,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Data-transfer object for adding a comment to a ticket.
 *
 * The `authorId` field is accepted for API contract compatibility
 * (README specifies `{ "authorId": 2, "content": "..." }`) but is
 * **overridden at runtime** by the authenticated user's JWT payload
 * (`req.user.userId`) to prevent author spoofing.
 */
export class CreateCommentDto {
  /**
   * Accepted for contract compatibility but overridden by the
   * authenticated user's ID from the JWT payload.
   */
  @ApiPropertyOptional({ description: 'Ignored at runtime; author is derived from JWT' })
  @IsOptional()
  @IsInt()
  authorId?: number;

  /** Comment body (1-5000 characters). May contain `@username` mentions. */
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}

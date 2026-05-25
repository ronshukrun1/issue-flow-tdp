import {
  IsString,
  IsNotEmpty,
  IsInt,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Data-transfer object for adding a comment to a ticket.
 *
 * The `authorId` field is required by the README contract and is checked
 * against the authenticated user's JWT payload (`req.user.userId`) to
 * prevent author spoofing.
 */
export class CreateCommentDto {
  /**
   * Must match the authenticated user's ID from the JWT payload.
   */
  @ApiProperty({ description: 'Must match the authenticated user ID' })
  @IsInt()
  authorId!: number;

  /** Comment body (1-5000 characters). May contain `@username` mentions. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}

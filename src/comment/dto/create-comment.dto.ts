import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Data-transfer object for adding a comment to a ticket.
 *
 * The `authorId` is NOT accepted from the client — it is extracted
 * from the authenticated user's JWT payload (`req.user.userId`)
 * at the controller level to prevent author spoofing.
 */
export class CreateCommentDto {
  /** Comment body (1-5000 characters). May contain `@username` mentions. */
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  content!: string;
}

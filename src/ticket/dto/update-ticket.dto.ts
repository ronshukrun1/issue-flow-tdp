import {
  IsString,
  IsEnum,
  IsInt,
  IsOptional,
  IsDateString,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { TicketStatus } from '../enums/ticket-status.enum';
import { TicketPriority } from '../enums/ticket-priority.enum';

/**
 * Data-transfer object for updating an existing ticket.
 *
 * All fields are optional so a client can send a partial update.
 * Status transitions are validated at the service layer (forward-only).
 */
export class UpdateTicketDto {
  /** Updated title (1-255 characters, trimmed). */
  @IsOptional()
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  title?: string;

  /** Updated description (1-5000 characters, trimmed). */
  @IsOptional()
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  description?: string;

  /** Updated status — must follow the forward-only lifecycle. */
  @IsOptional()
  @IsEnum(TicketStatus, {
    message: 'status must be one of: TODO, IN_PROGRESS, IN_REVIEW, DONE',
  })
  status?: TicketStatus;

  /** Updated priority. */
  @IsOptional()
  @IsEnum(TicketPriority, {
    message: 'priority must be one of: LOW, MEDIUM, HIGH, CRITICAL',
  })
  priority?: TicketPriority;

  /** Updated assignee user ID. */
  @IsOptional()
  @IsInt()
  assigneeId?: number;

  /** Updated due date in ISO-8601 format. */
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

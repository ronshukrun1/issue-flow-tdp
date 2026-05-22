import {
  IsString,
  IsNotEmpty,
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
import { TicketType } from '../enums/ticket-type.enum';

/**
 * Data-transfer object for creating a new ticket.
 *
 * All fields are required except `assigneeId` and `dueDate`.
 */
export class CreateTicketDto {
  /** Ticket title (1-255 characters, trimmed). */
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  /** Ticket description (1-5000 characters, trimmed). */
  @Transform(({ value }: { value: string }) => value?.trim())
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  description!: string;

  /** Must be one of: TODO, IN_PROGRESS, IN_REVIEW, DONE. */
  @IsEnum(TicketStatus, {
    message: 'status must be one of: TODO, IN_PROGRESS, IN_REVIEW, DONE',
  })
  status!: TicketStatus;

  /** Must be one of: LOW, MEDIUM, HIGH, CRITICAL. */
  @IsEnum(TicketPriority, {
    message: 'priority must be one of: LOW, MEDIUM, HIGH, CRITICAL',
  })
  priority!: TicketPriority;

  /** Must be one of: BUG, FEATURE, TECHNICAL. */
  @IsEnum(TicketType, {
    message: 'type must be one of: BUG, FEATURE, TECHNICAL',
  })
  type!: TicketType;

  /** ID of the project this ticket belongs to. */
  @IsInt()
  projectId!: number;

  /** Optional assignee user ID. */
  @IsOptional()
  @IsInt()
  assigneeId?: number;

  /** Optional due date in ISO-8601 format. */
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsInt,
  IsOptional,
  IsDateString,
  ValidateIf,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(255)
  title!: string;

  /** Ticket description (1-5000 characters, trimmed). */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(5000)
  description!: string;

  /** Must be one of: TODO, IN_PROGRESS, IN_REVIEW, DONE. */
  @ApiProperty({ enum: TicketStatus })
  @IsEnum(TicketStatus, {
    message: 'status must be one of: TODO, IN_PROGRESS, IN_REVIEW, DONE',
  })
  status!: TicketStatus;

  /** Must be one of: LOW, MEDIUM, HIGH, CRITICAL. */
  @ApiProperty({ enum: TicketPriority })
  @IsEnum(TicketPriority, {
    message: 'priority must be one of: LOW, MEDIUM, HIGH, CRITICAL',
  })
  priority!: TicketPriority;

  /** Must be one of: BUG, FEATURE, TECHNICAL. */
  @ApiProperty({ enum: TicketType })
  @IsEnum(TicketType, {
    message: 'type must be one of: BUG, FEATURE, TECHNICAL',
  })
  type!: TicketType;

  /** ID of the project this ticket belongs to. */
  @IsInt()
  projectId!: number;

  /** Optional assignee user ID. */
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((o) => o.assigneeId !== null)
  @IsInt({ message: 'assigneeId must be an integer' })
  assigneeId?: number | null;

  /** Optional due date in ISO-8601 format. */
  @ApiPropertyOptional({ example: '2025-12-31T23:59:59.000Z' })
  @IsOptional()
  @ValidateIf((o) => o.dueDate !== null)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsDateString({}, { message: 'dueDate must be a valid ISO-8601 date string' })
  dueDate?: string | null;
}

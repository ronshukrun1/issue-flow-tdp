import { IsInt } from 'class-validator';

/**
 * Data-transfer object for adding a blocker dependency to a ticket.
 */
export class AddDependencyDto {
  /** ID of the ticket that blocks this ticket. */
  @IsInt()
  blockedBy!: number;
}

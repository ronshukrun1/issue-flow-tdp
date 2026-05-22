/**
 * Lifecycle statuses for a ticket.
 *
 * Transitions are strictly forward-only:
 * `TODO` -> `IN_PROGRESS` -> `IN_REVIEW` -> `DONE`
 */
export enum TicketStatus {
  TODO = 'TODO',
  IN_PROGRESS = 'IN_PROGRESS',
  IN_REVIEW = 'IN_REVIEW',
  DONE = 'DONE',
}

/**
 * Numeric ordering used to enforce forward-only status transitions.
 * A status change is valid only when the new ordinal is strictly
 * greater than the current one.
 */
export const STATUS_ORDER: Record<TicketStatus, number> = {
  [TicketStatus.TODO]: 0,
  [TicketStatus.IN_PROGRESS]: 1,
  [TicketStatus.IN_REVIEW]: 2,
  [TicketStatus.DONE]: 3,
};

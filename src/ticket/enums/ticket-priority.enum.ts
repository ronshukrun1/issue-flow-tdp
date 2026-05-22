/**
 * Priority levels for a ticket, ordered from lowest to highest urgency.
 *
 * Auto-escalation promotes one level at a time:
 * `LOW` -> `MEDIUM` -> `HIGH` -> `CRITICAL`
 */
export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

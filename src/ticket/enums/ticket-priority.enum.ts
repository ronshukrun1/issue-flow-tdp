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

/** Numeric ordering used by escalation logic. */
export const PRIORITY_ORDER: Record<TicketPriority, number> = {
  [TicketPriority.LOW]: 0,
  [TicketPriority.MEDIUM]: 1,
  [TicketPriority.HIGH]: 2,
  [TicketPriority.CRITICAL]: 3,
};

/** Priority levels in ascending order. */
const PRIORITY_LEVELS: TicketPriority[] = [
  TicketPriority.LOW,
  TicketPriority.MEDIUM,
  TicketPriority.HIGH,
  TicketPriority.CRITICAL,
];

/**
 * Returns the next higher priority, or `null` if already at CRITICAL.
 */
export function nextPriority(p: TicketPriority): TicketPriority | null {
  const idx = PRIORITY_LEVELS.indexOf(p);
  return idx < PRIORITY_LEVELS.length - 1 ? PRIORITY_LEVELS[idx + 1] : null;
}

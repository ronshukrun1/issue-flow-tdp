import { QueryFailedError } from 'typeorm';

/**
 * Generic client-safe message when a `FOR UPDATE NOWAIT` attempt cannot acquire
 * the row lock immediately (PostgreSQL SQLSTATE **55P03**).
 *
 * Avoids implying that another user is editing the resource.
 */
export const PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE =
  'The system was unable to process your request at this moment. Please try again in a few moments.';

/** PostgreSQL `lock_not_available` */
const PG_LOCK_NOT_AVAILABLE_SQLSTATE = '55P03';

/**
 * Detects PostgreSQL lock-not-available errors from pessimistic **`NOWAIT`**
 * row locking (typically while another transaction holds **`FOR UPDATE`**).
 */
export function isPgLockNotAvailableError(error: unknown): boolean {
  if (!(error instanceof QueryFailedError)) {
    return false;
  }
  const driver = error.driverError as { code?: string } | undefined;
  if (driver?.code === PG_LOCK_NOT_AVAILABLE_SQLSTATE) {
    return true;
  }
  const anyErr = error as QueryFailedError & { code?: string };
  return anyErr.code === PG_LOCK_NOT_AVAILABLE_SQLSTATE;
}

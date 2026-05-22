/**
 * Actions recorded in the audit log.
 *
 * `CREATE`, `UPDATE`, and `DELETE` cover user-initiated mutations.
 * `AUTO_ASSIGN` and `AUTO_ESCALATE` are system-triggered actions.
 */
export enum AuditAction {
  CREATE = 'CREATE',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  AUTO_ASSIGN = 'AUTO_ASSIGN',
  AUTO_ESCALATE = 'AUTO_ESCALATE',
}

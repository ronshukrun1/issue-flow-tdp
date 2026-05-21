/**
 * Allowed user roles within the IssueFlow platform.
 *
 * - `ADMIN`     – full access to all administrative and management operations.
 * - `DEVELOPER` – standard user who works on tickets within assigned projects.
 */
export enum Role {
  ADMIN = 'ADMIN',
  DEVELOPER = 'DEVELOPER',
}

import { SelectQueryBuilder } from 'typeorm';
import { User } from '../user/user.entity';
import { Role } from '../user/role.enum';
import { TicketStatus } from './enums/ticket-status.enum';

/**
 * Counts only non-DONE, active tickets assigned to the developer in the target project.
 */
export const OPEN_TICKET_JOIN_CONDITION =
  'ticket."assigneeId" = user.id AND ticket."projectId" = :projectId AND ticket.status != :done AND ticket."deletedAt" IS NULL';

/**
 * Restricts workload candidates to DEVELOPER users already linked to at least
 * one active ticket in the project.
 */
export const PROJECT_ASSIGNEE_TICKET_ALIAS = 'project_ticket';

export const PROJECT_ASSIGNEE_JOIN_CONDITION = `${PROJECT_ASSIGNEE_TICKET_ALIAS}."assigneeId" = user.id AND ${PROJECT_ASSIGNEE_TICKET_ALIAS}."projectId" = :projectId AND ${PROJECT_ASSIGNEE_TICKET_ALIAS}."assigneeId" IS NOT NULL AND ${PROJECT_ASSIGNEE_TICKET_ALIAS}."deletedAt" IS NULL`;

export const OPEN_TICKET_COUNT_SQL = 'COUNT(DISTINCT ticket.id)';

export function applyProjectDeveloperWorkloadQuery(
  queryBuilder: SelectQueryBuilder<User>,
  projectId: number,
  options: { excludeUserId?: number } = {},
): SelectQueryBuilder<User> {
  const qb = queryBuilder
    .innerJoin(
      'tickets',
      PROJECT_ASSIGNEE_TICKET_ALIAS,
      PROJECT_ASSIGNEE_JOIN_CONDITION,
      { projectId },
    )
    .leftJoin('tickets', 'ticket', OPEN_TICKET_JOIN_CONDITION, {
      projectId,
      done: TicketStatus.DONE,
    })
    .where('user.role = :role', { role: Role.DEVELOPER })
    .select('user.id', 'userId')
    .addSelect(OPEN_TICKET_COUNT_SQL, 'openTicketCount')
    .groupBy('user.id')
    .addGroupBy('user.createdAt');

  if (options.excludeUserId !== undefined) {
    qb.andWhere('user.id != :excludeUserId', {
      excludeUserId: options.excludeUserId,
    });
  }

  return qb;
}

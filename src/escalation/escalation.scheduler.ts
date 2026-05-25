import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, LessThan } from 'typeorm';
import { Ticket } from '../ticket/ticket.entity';
import { TicketStatus } from '../ticket/enums/ticket-status.enum';
import {
  TicketPriority,
  nextPriority,
} from '../ticket/enums/ticket-priority.enum';
import { AuditLogService, AuditLogEntry } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';

/**
 * Background scheduler that implements TDP 3.7 auto-escalation.
 *
 * On each cron run the scheduler finds active, overdue tickets and
 * promotes their priority by one level (`LOW -> MEDIUM -> HIGH -> CRITICAL`).
 * When a ticket reaches `CRITICAL` while still overdue, the `isOverdue`
 * flag is set to `true`.
 *
 * Escalation is idempotent: a `CRITICAL` ticket with `isOverdue = true`
 * is never modified again.
 *
 * A concurrency guard prevents overlapping runs, and all database
 * writes are batched into bulk operations to minimise roundtrips.
 */
@Injectable()
export class EscalationScheduler {
  private readonly logger = new Logger(EscalationScheduler.name);
  private isRunning = false;

  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Runs every minute and escalates overdue tickets one priority level.
   * Skips execution if the previous run has not yet completed.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleEscalation(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn(
        'Skipping escalation run — previous run still in progress',
      );
      return;
    }

    this.isRunning = true;
    try {
      const now = new Date();

      const overdueTickets = await this.ticketRepository.find({
        where: {
          status: Not(TicketStatus.DONE),
          dueDate: LessThan(now),
        },
      });

      const modifiedTickets: Ticket[] = [];
      const auditEntries: AuditLogEntry[] = [];

      for (const ticket of overdueTickets) {
        let changed = false;

        if (ticket.priority !== TicketPriority.CRITICAL) {
          const promoted = nextPriority(ticket.priority);
          if (promoted) {
            ticket.priority = promoted;
            changed = true;
            if (promoted === TicketPriority.CRITICAL) {
              ticket.isOverdue = true;
            }
          }
        } else if (!ticket.isOverdue) {
          ticket.isOverdue = true;
          changed = true;
        }

        if (changed) {
          modifiedTickets.push(ticket);
          auditEntries.push({
            action: AuditAction.AUTO_ESCALATE,
            entityType: 'TICKET',
            entityId: ticket.id,
            performedBy: null,
            actor: 'SYSTEM',
          });
        }
      }

      if (modifiedTickets.length > 0) {
        await this.ticketRepository.save(modifiedTickets);
        await this.auditLogService.logMany(auditEntries);

        for (const ticket of modifiedTickets) {
          this.logger.log(
            `Escalated ticket ${ticket.id} to ${ticket.priority} (isOverdue=${ticket.isOverdue})`,
          );
        }
      }
    } finally {
      this.isRunning = false;
    }
  }
}

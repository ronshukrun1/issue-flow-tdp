import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ticket } from '../ticket/ticket.entity';
import { EscalationScheduler } from './escalation.scheduler';

/**
 * Module for the background auto-escalation scheduler.
 *
 * Imports the {@link Ticket} entity so the scheduler can query
 * and update overdue tickets. {@link AuditLogModule} is globally
 * available so `AuditLogService` is injected without an explicit import.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Ticket])],
  providers: [EscalationScheduler],
})
export class EscalationModule {}

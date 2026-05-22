import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './audit-log.entity';
import { AuditAction } from './enums/audit-action.enum';

/** Shape of the parameters accepted by {@link AuditLogService.log}. */
export interface AuditLogEntry {
  action: AuditAction;
  entityType: string;
  entityId: number;
  performedBy: number | null;
  actor: string;
}

/**
 * Provides append-only audit logging and filtered retrieval.
 *
 * The `log()` method is fault-tolerant: persistence failures are
 * caught and logged rather than propagated, so audit errors never
 * crash user-facing HTTP requests.
 */
@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Persists a single audit log entry.
   *
   * Failures are swallowed and logged so the caller's transaction
   * is never rolled back by an audit persistence problem.
   *
   * @param entry - The audit event to record.
   * @returns The persisted {@link AuditLog} entity, or `null` on failure.
   */
  async log(entry: AuditLogEntry): Promise<AuditLog | null> {
    try {
      const record = this.auditLogRepository.create(entry);
      return await this.auditLogRepository.save(record);
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(`Failed to persist audit log: ${msg}`);
      return null;
    }
  }

  /**
   * Persists multiple audit log entries in a single batch operation.
   *
   * @param entries - An array of audit events to record.
   * @returns The persisted {@link AuditLog} entities.
   */
  async logMany(entries: AuditLogEntry[]): Promise<AuditLog[]> {
    if (entries.length === 0) return [];
    const records = entries.map((e) => this.auditLogRepository.create(e));
    return this.auditLogRepository.save(records);
  }

  /**
   * Retrieves audit log entries with optional filters.
   *
   * All filter parameters are optional; when omitted the corresponding
   * column is not filtered.
   *
   * @param filters - Optional query filters.
   * @returns An array of matching {@link AuditLog} entries, newest first.
   */
  async findAll(filters: {
    entityType?: string;
    entityId?: number;
    action?: string;
    actor?: string;
  }): Promise<AuditLog[]> {
    const qb = this.auditLogRepository.createQueryBuilder('log');

    if (filters.entityType) {
      qb.andWhere('log.entityType = :entityType', {
        entityType: filters.entityType,
      });
    }
    if (filters.entityId !== undefined) {
      qb.andWhere('log.entityId = :entityId', {
        entityId: filters.entityId,
      });
    }
    if (filters.action) {
      qb.andWhere('log.action = :action', { action: filters.action });
    }
    if (filters.actor) {
      qb.andWhere('log.actor = :actor', { actor: filters.actor });
    }

    qb.orderBy('log.timestamp', 'DESC');
    return qb.getMany();
  }
}

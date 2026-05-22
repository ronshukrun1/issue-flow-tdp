import {
  Controller,
  Get,
  Query,
} from '@nestjs/common';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './audit-log.entity';

/**
 * Read-only controller for the audit log.
 *
 * `GET /audit-logs` supports optional query parameters to filter
 * results by `entityType`, `entityId`, `action`, and `actor`.
 */
@Controller('audit-logs')
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  /**
   * `GET /audit-logs` — retrieves audit log entries, optionally filtered.
   */
  @Get()
  findAll(
    @Query('entityType') entityType?: string,
    @Query('entityId') entityId?: string,
    @Query('action') action?: string,
    @Query('actor') actor?: string,
  ): Promise<AuditLog[]> {
    return this.auditLogService.findAll({
      entityType,
      entityId: entityId ? Number(entityId) : undefined,
      action,
      actor,
    });
  }
}

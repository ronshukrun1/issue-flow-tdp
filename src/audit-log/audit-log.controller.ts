import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuditLogService } from './audit-log.service';
import { AuditLog } from './audit-log.entity';

/**
 * Read-only controller for the audit log.
 *
 * `GET /audit-logs` supports optional query parameters to filter
 * results by `entityType`, `entityId`, `action`, and `actor`.
 */
@ApiTags('Audit Logs')
@ApiBearerAuth()
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
    const parsedId = this.parseOptionalEntityId(entityId);
    return this.auditLogService.findAll({
      entityType,
      entityId: parsedId,
      action,
      actor,
    });
  }

  private parseOptionalEntityId(entityId?: string): number | undefined {
    if (entityId === undefined) {
      return undefined;
    }

    if (!/^\d+$/.test(entityId)) {
      throw new BadRequestException('entityId must be a positive integer');
    }

    const parsed = Number(entityId);
    if (!Number.isSafeInteger(parsed) || parsed < 1) {
      throw new BadRequestException('entityId must be a positive integer');
    }

    return parsed;
  }
}

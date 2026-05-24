import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Req,
  Res,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  MaxTicketCsvSizeValidator,
  CsvOriginalNameValidator,
} from './csv-import-file.validators';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request, Response } from 'express';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { CsvImportRowError } from './csv-import-row-error';
import { Ticket } from './ticket.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/role.enum';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';

/**
 * Handles all HTTP requests for the `/tickets` resource.
 *
 * Endpoints match the Tickets API contract in the project README.
 * Administrative operations (listing deleted, restoring) require
 * the ADMIN role. State-changing actions are recorded in the audit log.
 */
@ApiTags('Tickets')
@ApiBearerAuth()
@Controller('tickets')
export class TicketController {
  constructor(
    private readonly ticketService: TicketService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * `GET /tickets?projectId=` — returns active tickets filtered by project.
   */
  @Get()
  findByProject(
    @Query('projectId', ParseIntPipe) projectId: number,
  ): Promise<Ticket[]> {
    return this.ticketService.findByProject(projectId);
  }

  /**
   * `GET /tickets/deleted?projectId=` — returns soft-deleted tickets for a project.
   *
   * Restricted to ADMIN users.
   */
  @Roles(Role.ADMIN)
  @Get('deleted')
  findDeleted(
    @Query('projectId', ParseIntPipe) projectId: number,
  ): Promise<Ticket[]> {
    return this.ticketService.findDeleted(projectId);
  }

  // ── CSV Export / Import ─────────────────────────────────────────

  /**
   * `GET /tickets/export?projectId=` — exports active tickets as a CSV file.
   */
  @Get('export')
  async exportCsv(
    @Query('projectId', ParseIntPipe) projectId: number,
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.ticketService.exportToCsv(projectId);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="tickets.csv"',
    );
    res.send(csv);
  }

  /**
   * `POST /tickets/import` — imports tickets from a CSV file.
   *
   * Validates **`text/csv`** MIME type, **`originalname`** ending in **`.csv`**,
   * and **`10 MB`** max size inclusive at the multipart boundary (`ParseFilePipe`)
   * before processing.
   */
  @Post('import')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'projectId'],
      properties: {
        file: { type: 'string', format: 'binary' },
        projectId: { type: 'integer' },
      },
    },
  })
  importCsv(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxTicketCsvSizeValidator(),
          new CsvOriginalNameValidator(),
          new FileTypeValidator({
            fileType: /^text\/csv$/,
            skipMagicNumbersValidation: true,
          }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('projectId', ParseIntPipe) projectId: number,
    @Req() req: Request,
  ): Promise<{ created: number; failed: number; errors: CsvImportRowError[] }> {
    return this.ticketService.importFromCsv(
      projectId,
      file.buffer,
      (req.user as { userId: number }).userId,
    );
  }

  /**
   * `GET /tickets/:ticketId` — returns a single ticket by ID.
   */
  @Get(':ticketId')
  findOne(
    @Param('ticketId', ParseIntPipe) ticketId: number,
  ): Promise<Ticket> {
    return this.ticketService.findOne(ticketId);
  }

  /**
   * `POST /tickets` — creates a new ticket.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async create(
    @Body() dto: CreateTicketDto,
    @Req() req: Request,
  ): Promise<Ticket> {
    const ticket = await this.ticketService.create(dto);
    await this.auditLogService.log({
      action: AuditAction.CREATE,
      entityType: 'TICKET',
      entityId: ticket.id,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
    return ticket;
  }

  /**
   * `PATCH /tickets/:ticketId` — updates a ticket's fields.
   */
  @Patch(':ticketId')
  @HttpCode(HttpStatus.OK)
  async update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.ticketService.update(ticketId, dto);
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: 'TICKET',
      entityId: ticketId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }

  /**
   * `DELETE /tickets/:ticketId` — soft-deletes a ticket.
   */
  @Delete(':ticketId')
  async remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Req() req: Request,
  ): Promise<void> {
    await this.ticketService.softRemove(ticketId);
    await this.auditLogService.log({
      action: AuditAction.DELETE,
      entityType: 'TICKET',
      entityId: ticketId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }

  /**
   * `POST /tickets/:ticketId/restore` — restores a soft-deleted ticket.
   *
   * Restricted to ADMIN users.
   */
  @Roles(Role.ADMIN)
  @Post(':ticketId/restore')
  @HttpCode(HttpStatus.OK)
  async restore(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Req() req: Request,
  ): Promise<void> {
    await this.ticketService.restore(ticketId);
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: 'TICKET',
      entityId: ticketId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }

  // ── Dependency endpoints ─────────────────────────────────────

  /**
   * `POST /tickets/:ticketId/dependencies` — adds a blocker dependency.
   */
  @Post(':ticketId/dependencies')
  @HttpCode(HttpStatus.OK)
  async addDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: AddDependencyDto,
    @Req() req: Request,
  ): Promise<void> {
    await this.ticketService.addDependency(ticketId, dto);
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: 'TICKET',
      entityId: ticketId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }

  /**
   * `GET /tickets/:ticketId/dependencies` — lists all blocking tickets.
   */
  @Get(':ticketId/dependencies')
  async getDependencies(
    @Param('ticketId', ParseIntPipe) ticketId: number,
  ): Promise<{ id: number; title: string; status: string }[]> {
    const tickets = await this.ticketService.getDependencies(ticketId);
    return tickets.map((t) => ({ id: t.id, title: t.title, status: t.status }));
  }

  /**
   * `DELETE /tickets/:ticketId/dependencies/:blockerId` — removes a blocker.
   */
  @Delete(':ticketId/dependencies/:blockerId')
  async removeDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('blockerId', ParseIntPipe) blockerId: number,
    @Req() req: Request,
  ): Promise<void> {
    await this.ticketService.removeDependency(ticketId, blockerId);
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: 'TICKET',
      entityId: ticketId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }
}

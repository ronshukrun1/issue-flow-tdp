import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Res,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { TicketService } from './ticket.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { Ticket } from './ticket.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/role.enum';

/**
 * Handles all HTTP requests for the `/tickets` resource.
 *
 * Endpoints match the Tickets API contract in the project README.
 * Administrative operations (listing deleted, restoring) require
 * the ADMIN role.
 */
@Controller('tickets')
export class TicketController {
  constructor(private readonly ticketService: TicketService) {}

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
   * Accepts `multipart/form-data` with a `file` field (CSV) and
   * a `projectId` form field.
   */
  @Post('import')
  @UseInterceptors(FileInterceptor('file'))
  importCsv(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: /^text\/csv$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('projectId', ParseIntPipe) projectId: number,
  ): Promise<{ created: number; failed: number; errors: string[] }> {
    return this.ticketService.importFromCsv(projectId, file.buffer);
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
  create(@Body() dto: CreateTicketDto): Promise<Ticket> {
    return this.ticketService.create(dto);
  }

  /**
   * `PATCH /tickets/:ticketId` — updates a ticket's fields.
   *
   * Enforces the forward-only status lifecycle and rejects updates
   * to tickets that have reached the DONE state.
   */
  @Patch(':ticketId')
  update(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: UpdateTicketDto,
  ): Promise<Ticket> {
    return this.ticketService.update(ticketId, dto);
  }

  /**
   * `DELETE /tickets/:ticketId` — soft-deletes a ticket.
   */
  @Delete(':ticketId')
  remove(
    @Param('ticketId', ParseIntPipe) ticketId: number,
  ): Promise<void> {
    return this.ticketService.softRemove(ticketId);
  }

  /**
   * `POST /tickets/:ticketId/restore` — restores a soft-deleted ticket.
   *
   * Restricted to ADMIN users.
   */
  @Roles(Role.ADMIN)
  @Post(':ticketId/restore')
  restore(
    @Param('ticketId', ParseIntPipe) ticketId: number,
  ): Promise<void> {
    return this.ticketService.restore(ticketId);
  }

  // ── Dependency endpoints ─────────────────────────────────────

  /**
   * `POST /tickets/:ticketId/dependencies` — adds a blocker dependency.
   */
  @Post(':ticketId/dependencies')
  addDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Body() dto: AddDependencyDto,
  ): Promise<void> {
    return this.ticketService.addDependency(ticketId, dto);
  }

  /**
   * `GET /tickets/:ticketId/dependencies` — lists all blocking tickets.
   */
  @Get(':ticketId/dependencies')
  getDependencies(
    @Param('ticketId', ParseIntPipe) ticketId: number,
  ): Promise<Ticket[]> {
    return this.ticketService.getDependencies(ticketId);
  }

  /**
   * `DELETE /tickets/:ticketId/dependencies/:blockerId` — removes a blocker.
   */
  @Delete(':ticketId/dependencies/:blockerId')
  removeDependency(
    @Param('ticketId', ParseIntPipe) ticketId: number,
    @Param('blockerId', ParseIntPipe) blockerId: number,
  ): Promise<void> {
    return this.ticketService.removeDependency(ticketId, blockerId);
  }
}

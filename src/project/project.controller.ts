import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Req,
  ParseIntPipe,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './project.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/role.enum';
import { TicketService } from '../ticket/ticket.service';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';

/**
 * Handles all HTTP requests for the `/projects` resource.
 *
 * Each endpoint maps directly to the Projects API contract
 * defined in the project README. Administrative endpoints
 * (deleted listing, restore) are restricted to ADMIN users.
 */
@ApiTags('Projects')
@ApiBearerAuth()
@Controller('projects')
export class ProjectController {
  constructor(
    private readonly projectService: ProjectService,
    @Inject(forwardRef(() => TicketService))
    private readonly ticketService: TicketService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * `GET /projects` — returns all active (non-deleted) projects.
   */
  @Get()
  findAll(): Promise<Project[]> {
    return this.projectService.findAll();
  }

  /**
   * `GET /projects/deleted` — returns all soft-deleted projects.
   *
   * Restricted to ADMIN users.
   */
  @Roles(Role.ADMIN)
  @Get('deleted')
  findDeleted(): Promise<Project[]> {
    return this.projectService.findDeleted();
  }

  /**
   * `GET /projects/:projectId/workload` — returns workload data
   * for all DEVELOPER users in the project.
   */
  @Get(':projectId/workload')
  getWorkload(
    @Param('projectId', ParseIntPipe) projectId: number,
  ): Promise<{ userId: number; username: string; openTicketCount: number }[]> {
    return this.ticketService.getProjectWorkload(projectId);
  }

  /**
   * `GET /projects/:projectId` — returns a single project by ID.
   *
   * @param projectId - Path parameter parsed as an integer.
   */
  @Get(':projectId')
  findOne(
    @Param('projectId', ParseIntPipe) projectId: number,
  ): Promise<Project> {
    return this.projectService.findOne(projectId);
  }

  /**
   * `POST /projects` — creates a new project.
   */
  @Post()
  async create(
    @Body() dto: CreateProjectDto,
    @Req() req: Request,
  ): Promise<Project> {
    const project = await this.projectService.create(dto);
    await this.auditLogService.log({
      action: AuditAction.CREATE,
      entityType: 'PROJECT',
      entityId: project.id,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
    return project;
  }

  /**
   * `PATCH /projects/:projectId` — updates mutable fields of an existing project.
   */
  @Patch(':projectId')
  async update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: UpdateProjectDto,
    @Req() req: Request,
  ): Promise<Project> {
    const project = await this.projectService.update(projectId, dto);
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: 'PROJECT',
      entityId: projectId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
    return project;
  }

  /**
   * `DELETE /projects/:projectId` — soft-deletes a project.
   */
  @Delete(':projectId')
  async remove(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() req: Request,
  ): Promise<void> {
    await this.projectService.softRemove(projectId);
    await this.auditLogService.log({
      action: AuditAction.DELETE,
      entityType: 'PROJECT',
      entityId: projectId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }

  /**
   * `POST /projects/:projectId/restore` — restores a soft-deleted project.
   *
   * Restricted to ADMIN users.
   */
  @Roles(Role.ADMIN)
  @Post(':projectId/restore')
  async restore(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Req() req: Request,
  ): Promise<void> {
    await this.projectService.restore(projectId);
    await this.auditLogService.log({
      action: AuditAction.UPDATE,
      entityType: 'PROJECT',
      entityId: projectId,
      performedBy: (req.user as { userId: number }).userId,
      actor: 'USER',
    });
  }
}

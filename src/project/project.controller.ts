import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  ParseIntPipe,
} from '@nestjs/common';
import { ProjectService } from './project.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './project.entity';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../user/role.enum';

/**
 * Handles all HTTP requests for the `/projects` resource.
 *
 * Each endpoint maps directly to the Projects API contract
 * defined in the project README. Administrative endpoints
 * (deleted listing, restore) are restricted to ADMIN users.
 */
@Controller('projects')
export class ProjectController {
  constructor(private readonly projectService: ProjectService) {}

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
   *
   * The request body is validated against {@link CreateProjectDto}.
   */
  @Post()
  create(@Body() dto: CreateProjectDto): Promise<Project> {
    return this.projectService.create(dto);
  }

  /**
   * `POST /projects/update/:projectId` — updates mutable fields of an existing project.
   *
   * The request body is validated against {@link UpdateProjectDto}.
   */
  @Post('update/:projectId')
  update(
    @Param('projectId', ParseIntPipe) projectId: number,
    @Body() dto: UpdateProjectDto,
  ): Promise<Project> {
    return this.projectService.update(projectId, dto);
  }

  /**
   * `DELETE /projects/:projectId` — soft-deletes a project.
   */
  @Delete(':projectId')
  remove(
    @Param('projectId', ParseIntPipe) projectId: number,
  ): Promise<void> {
    return this.projectService.softRemove(projectId);
  }

  /**
   * `POST /projects/:projectId/restore` — restores a soft-deleted project.
   *
   * Restricted to ADMIN users.
   */
  @Roles(Role.ADMIN)
  @Post(':projectId/restore')
  restore(
    @Param('projectId', ParseIntPipe) projectId: number,
  ): Promise<void> {
    return this.projectService.restore(projectId);
  }
}

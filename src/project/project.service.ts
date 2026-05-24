import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Project } from './project.entity';
import { Ticket } from '../ticket/ticket.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UserService } from '../user/user.service';

/**
 * Encapsulates all business logic for project management.
 *
 * Supports full CRUD with soft-delete semantics: standard queries
 * exclude soft-deleted records, and dedicated methods list or
 * restore them. Project soft-delete/restore cascades to all active
 * tickets belonging to the project within a single transaction.
 */
@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
    private readonly dataSource: DataSource,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
  ) {}

  /**
   * Retrieves all active (non-soft-deleted) projects.
   *
   * @returns An array of {@link Project} entities.
   */
  async findAll(): Promise<Project[]> {
    return this.projectRepository.find();
  }

  /**
   * Retrieves a single active project by its primary key.
   *
   * @param id - The numeric project identifier.
   * @returns The matching {@link Project} entity.
   * @throws {NotFoundException} When no active project with the given ID exists.
   */
  async findOne(id: number): Promise<Project> {
    const project = await this.projectRepository.findOneBy({ id });
    if (!project) {
      throw new NotFoundException(`Project with ID ${id} not found`);
    }
    return project;
  }

  /**
   * Creates and persists a new project.
   *
   * Validates that the referenced `ownerId` points to an existing user
   * before persisting. Only `NotFoundException` from the user lookup is
   * translated to a `BadRequestException`; unexpected errors propagate.
   *
   * @param dto - Validated creation payload.
   * @returns The newly persisted {@link Project} entity.
   * @throws {BadRequestException} When the owner user does not exist.
   */
  async create(dto: CreateProjectDto): Promise<Project> {
    try {
      await this.userService.findOne(dto.ownerId);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(
          `Owner with ID ${dto.ownerId} does not exist`,
        );
      }
      throw error;
    }

    const project = this.projectRepository.create(dto);
    return this.projectRepository.save(project);
  }

  /**
   * Updates the mutable fields of an existing project.
   *
   * Only `name` and `description` may be changed. Uses explicit
   * field assignment to prevent overwriting protected columns.
   *
   * @param id  - The numeric project identifier.
   * @param dto - Validated update payload (partial).
   * @returns The updated {@link Project} entity.
   * @throws {NotFoundException} When no active project with the given ID exists.
   */
  async update(id: number, dto: UpdateProjectDto): Promise<Project> {
    const project = await this.findOne(id);

    if (dto.name !== undefined) {
      project.name = dto.name;
    }
    if (dto.description !== undefined) {
      project.description = dto.description;
    }

    return this.projectRepository.save(project);
  }

  /**
   * Soft-deletes a project and cascades the soft-delete to all active
   * tickets belonging to that project within a single transaction.
   *
   * @param id - The numeric project identifier.
   * @throws {NotFoundException} When no active project with the given ID exists.
   */
  async softRemove(id: number): Promise<void> {
    const project = await this.findOne(id);

    await this.dataSource.transaction(async (manager) => {
      const tickets = await manager.find(Ticket, { where: { projectId: id } });
      if (tickets.length > 0) {
        await manager.softRemove(Ticket, tickets);
      }
      await manager.softRemove(Project, project);
    });
  }

  /**
   * Lists all soft-deleted projects.
   *
   * @returns An array of soft-deleted {@link Project} entities.
   */
  async findDeleted(): Promise<Project[]> {
    return this.projectRepository
      .createQueryBuilder('project')
      .withDeleted()
      .where('project.deletedAt IS NOT NULL')
      .getMany();
  }

  /**
   * Restores a previously soft-deleted project and concurrently restores
   * all soft-deleted tickets belonging to that project.
   *
   * @param id - The numeric project identifier.
   * @throws {NotFoundException} When no soft-deleted project with the given ID exists.
   */
  async restore(id: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const result = await manager.restore(Project, id);
      if (result.affected === 0) {
        throw new NotFoundException(
          `Soft-deleted project with ID ${id} not found`,
        );
      }
      await manager.restore(Ticket, { projectId: id });
    });
  }
}

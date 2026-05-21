import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Project } from './project.entity';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { UserService } from '../user/user.service';

/**
 * Encapsulates all business logic for project management.
 *
 * Supports full CRUD with soft-delete semantics: standard queries
 * exclude soft-deleted records, and dedicated methods list or
 * restore them.
 */
@Injectable()
export class ProjectService {
  constructor(
    @InjectRepository(Project)
    private readonly projectRepository: Repository<Project>,
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
   * Soft-deletes a project by populating its `deletedAt` timestamp.
   *
   * The record remains in the database but is excluded from standard
   * queries. It can be restored later by an ADMIN.
   *
   * @param id - The numeric project identifier.
   * @throws {NotFoundException} When no active project with the given ID exists.
   */
  async softRemove(id: number): Promise<void> {
    const project = await this.findOne(id);
    await this.projectRepository.softRemove(project);
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
   * Restores a previously soft-deleted project.
   *
   * @param id - The numeric project identifier.
   * @throws {NotFoundException} When no soft-deleted project with the given ID exists.
   */
  async restore(id: number): Promise<void> {
    const result = await this.projectRepository.restore(id);
    if (result.affected === 0) {
      throw new NotFoundException(
        `Soft-deleted project with ID ${id} not found`,
      );
    }
  }
}

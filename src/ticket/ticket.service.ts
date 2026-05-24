import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Repository,
  OptimisticLockVersionMismatchError,
  DataSource,
} from 'typeorm';
import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse';
import { Ticket } from './ticket.entity';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import { AddDependencyDto } from './dto/add-dependency.dto';
import { TicketStatus, STATUS_ORDER } from './enums/ticket-status.enum';
import { TicketPriority } from './enums/ticket-priority.enum';
import { TicketType } from './enums/ticket-type.enum';
import { ProjectService } from '../project/project.service';
import { UserService } from '../user/user.service';
import { User } from '../user/user.entity';
import { Role } from '../user/role.enum';
import { AuditLogService } from '../audit-log/audit-log.service';
import { AuditAction } from '../audit-log/enums/audit-action.enum';
import {
  PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE,
  isPgLockNotAvailableError,
} from '../common/pg-nowait-row-lock';
import { Readable } from 'stream';
import {
  CsvImportRowError,
  CsvImportSummary,
} from './csv-import-row-error';

/** Maximum number of data rows (excluding the header) per ticket CSV import. */
export const MAX_TICKET_CSV_IMPORT_ROWS = 10_000;

/** Mirrors {@link CreateTicketDto} `@MaxLength(255)`. */
const CREATE_TICKET_TITLE_MAX_LEN = 255;

/** Mirrors {@link CreateTicketDto} `@MaxLength(5000)`. */
const CREATE_TICKET_DESCRIPTION_MAX_LEN = 5000;

const ALLOWED_STATUSES = 'TODO, IN_PROGRESS, IN_REVIEW, DONE';
const ALLOWED_PRIORITIES = 'LOW, MEDIUM, HIGH, CRITICAL';
const ALLOWED_TYPES = 'BUG, FEATURE, TECHNICAL';

function csvStatusMessage(value: string): string {
  const display = value.length > 0 ? value : '(empty)';
  return `Invalid status: ${display}. Allowed values are ${ALLOWED_STATUSES}.`;
}

function csvPriorityMessage(value: string): string {
  const display = value.length > 0 ? value : '(empty)';
  return `Invalid priority: ${display}. Allowed values are ${ALLOWED_PRIORITIES}.`;
}

function csvTypeMessage(value: string): string {
  const display = value.length > 0 ? value : '(empty)';
  return `Invalid type: ${display}. Allowed values are ${ALLOWED_TYPES}.`;
}

/**
 * Encapsulates all business logic for ticket management.
 *
 * Enforces the forward-only status lifecycle, prevents updates
 * to tickets that have reached the `DONE` state, and triggers
 * auto-assignment when a ticket is created without an assignee.
 */
@Injectable()
export class TicketService {
  constructor(
    @InjectRepository(Ticket)
    private readonly ticketRepository: Repository<Ticket>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @Inject(forwardRef(() => ProjectService))
    private readonly projectService: ProjectService,
    @Inject(forwardRef(() => UserService))
    private readonly userService: UserService,
    private readonly auditLogService: AuditLogService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Retrieves all active tickets belonging to a project.
   *
   * @param projectId - The project to filter by.
   * @returns An array of {@link Ticket} entities.
   * @throws {NotFoundException} When the project does not exist.
   */
  async findByProject(projectId: number): Promise<Ticket[]> {
    await this.projectService.findOne(projectId);
    return this.ticketRepository.find({ where: { projectId } });
  }

  /**
   * Retrieves a single active ticket by its primary key.
   *
   * @param id - The numeric ticket identifier.
   * @returns The matching {@link Ticket} entity.
   * @throws {NotFoundException} When no active ticket with the given ID exists.
   */
  async findOne(id: number): Promise<Ticket> {
    const ticket = await this.ticketRepository.findOneBy({ id });
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${id} not found`);
    }
    return ticket;
  }

  /**
   * Creates and persists a new ticket.
   *
   * Validates that the referenced `projectId` and optional `assigneeId`
   * point to existing entities before persisting. When `assigneeId` is
   * absent, auto-assignment selects the least-loaded DEVELOPER in the
   * project (TDP 3.8).
   *
   * @param dto - Validated creation payload.
   * @returns The newly persisted {@link Ticket} entity.
   * @throws {BadRequestException} When the project or assignee does not exist.
   */
  async create(dto: CreateTicketDto): Promise<Ticket> {
    try {
      await this.projectService.findOne(dto.projectId);
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        throw new BadRequestException(
          `Project with ID ${dto.projectId} does not exist`,
        );
      }
      throw error;
    }

    if (dto.assigneeId !== undefined && dto.assigneeId !== null) {
      try {
        await this.userService.findOne(dto.assigneeId);
      } catch (error: unknown) {
        if (error instanceof NotFoundException) {
          throw new BadRequestException(
            `Assignee with ID ${dto.assigneeId} does not exist`,
          );
        }
        throw error;
      }
    }

    const ticket = this.ticketRepository.create({
      ...dto,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      assigneeId: dto.assigneeId ?? null,
    });
    const saved = await this.ticketRepository.save(ticket);

    if (saved.assigneeId === null) {
      const assigned = await this.autoAssign(saved);
      if (assigned) return assigned;
    }

    return saved;
  }

  /**
   * Updates the mutable fields of an existing ticket.
   *
   * Enforces business rules:
   * 1. A ticket with status `DONE` cannot be updated.
   * 2. Status may only move forward in the lifecycle.
   * 3. Manual priority change resets `isOverdue` (TDP 3.7).
   *
   * @param id  - The numeric ticket identifier.
   * @param dto - Validated update payload (partial).
   * @returns The updated {@link Ticket} entity.
   * @throws {NotFoundException} When the ticket does not exist.
   * @throws {BadRequestException} When the ticket is DONE or status moves backward.
   * @throws {ConflictException} When the pessimistic **`NOWAIT`** row lock cannot be acquired (SQLSTATE `55P03`).
   */
  async update(id: number, dto: UpdateTicketDto): Promise<Ticket> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      let ticket: Ticket | null;
      try {
        ticket = await queryRunner.manager.findOne(Ticket, {
          where: { id },
          lock: { mode: 'pessimistic_write', onLocked: 'nowait' },
        });
      } catch (error: unknown) {
        if (isPgLockNotAvailableError(error)) {
          throw new ConflictException(PG_NOWAIT_ROW_LOCK_GENERIC_MESSAGE);
        }
        throw error;
      }

      if (!ticket) {
        throw new NotFoundException(`Ticket with ID ${id} not found`);
      }

      if (ticket.status === TicketStatus.DONE) {
        throw new BadRequestException(
          'Cannot update a ticket that is already DONE',
        );
      }

      if (dto.status !== undefined) {
        const currentOrder = STATUS_ORDER[ticket.status];
        const newOrder = STATUS_ORDER[dto.status];
        if (newOrder <= currentOrder) {
          throw new BadRequestException(
            `Invalid status transition: ${ticket.status} → ${dto.status}. Status can only move forward.`,
          );
        }

        if (dto.status === TicketStatus.DONE) {
          const unresolvedCount = await queryRunner.manager
            .createQueryBuilder(Ticket, 'ticket')
            .innerJoin(
              'ticket_dependencies',
              'dep',
              'dep."ticketId" = :ticketId',
              { ticketId: id },
            )
            .innerJoin(
              'tickets',
              'blocker',
              'blocker.id = dep."blockedById"',
            )
            .where('blocker.status != :done', { done: TicketStatus.DONE })
            .getCount();
          if (unresolvedCount > 0) {
            throw new BadRequestException(
              `Cannot transition to DONE: ${unresolvedCount} unresolved blocker(s)`,
            );
          }
        }
      }

      if (dto.assigneeId !== undefined) {
        try {
          await this.userService.findOne(dto.assigneeId);
        } catch (error: unknown) {
          if (error instanceof NotFoundException) {
            throw new BadRequestException(
              `Assignee with ID ${dto.assigneeId} does not exist`,
            );
          }
          throw error;
        }
      }

      if (dto.title !== undefined) ticket.title = dto.title;
      if (dto.description !== undefined) ticket.description = dto.description;
      if (dto.status !== undefined) ticket.status = dto.status;
      if (dto.priority !== undefined) {
        ticket.priority = dto.priority;
        ticket.isOverdue = false;
      }
      if (dto.assigneeId !== undefined) ticket.assigneeId = dto.assigneeId;
      if (dto.dueDate !== undefined) {
        ticket.dueDate = dto.dueDate ? new Date(dto.dueDate) : null;
      }

      let saved: Ticket;
      try {
        saved = await queryRunner.manager.save(Ticket, ticket);
      } catch (error: unknown) {
        if (error instanceof OptimisticLockVersionMismatchError) {
          throw new ConflictException(
            'Ticket was modified by another user. Please reload and retry.',
          );
        }
        throw error;
      }

      await queryRunner.commitTransaction();
      return saved;
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Soft-deletes a ticket by populating its `deletedAt` timestamp.
   *
   * @param id - The numeric ticket identifier.
   * @throws {NotFoundException} When the ticket does not exist.
   */
  async softRemove(id: number): Promise<void> {
    const ticket = await this.findOne(id);
    await this.ticketRepository.softRemove(ticket);
  }

  /**
   * Lists all soft-deleted tickets for a given project.
   *
   * @param projectId - The project to filter by.
   * @returns An array of soft-deleted {@link Ticket} entities.
   */
  async findDeleted(projectId: number): Promise<Ticket[]> {
    return this.ticketRepository
      .createQueryBuilder('ticket')
      .withDeleted()
      .where('ticket.projectId = :projectId', { projectId })
      .andWhere('ticket.deletedAt IS NOT NULL')
      .getMany();
  }

  /**
   * Restores a previously soft-deleted ticket.
   *
   * @param id - The numeric ticket identifier.
   * @throws {NotFoundException} When no soft-deleted ticket with the given ID exists.
   */
  async restore(id: number): Promise<void> {
    const result = await this.ticketRepository.restore(id);
    if (result.affected === 0) {
      throw new NotFoundException(
        `Soft-deleted ticket with ID ${id} not found`,
      );
    }
  }

  // ── Auto-Assignment (TDP 3.8) ────────────────────────────────────

  /**
   * Selects the least-loaded DEVELOPER in the project and assigns
   * the ticket to them. Ties are broken by registration order
   * (oldest user first).
   *
   * @returns The updated ticket if assigned, or `null` if no DEVELOPERs exist.
   */
  private async autoAssign(ticket: Ticket): Promise<Ticket | null> {
    const result = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin(
        'tickets',
        'ticket',
        'ticket."assigneeId" = user.id AND ticket."projectId" = :projectId AND ticket.status != :done AND ticket."deletedAt" IS NULL',
        { projectId: ticket.projectId, done: TicketStatus.DONE },
      )
      .where('user.role = :role', { role: Role.DEVELOPER })
      .select('user.id', 'userId')
      .addSelect('COUNT(ticket.id)', 'openTicketCount')
      .groupBy('user.id')
      .addGroupBy('user.createdAt')
      .orderBy('COUNT(ticket.id)', 'ASC')
      .addOrderBy('user.createdAt', 'ASC')
      .limit(1)
      .getRawOne<{ userId: number; openTicketCount: string }>();

    if (!result) return null;

    ticket.assigneeId = result.userId;
    const saved = await this.ticketRepository.save(ticket);

    await this.auditLogService.log({
      action: AuditAction.AUTO_ASSIGN,
      entityType: 'TICKET',
      entityId: ticket.id,
      performedBy: null,
      actor: 'SYSTEM',
    });

    return saved;
  }

  // ── Workload API ──────────────────────────────────────────────────

  /**
   * Returns workload data for all DEVELOPER users, scoped to a project.
   *
   * @param projectId - The project to compute workload for.
   * @returns An array of `{ userId, username, openTicketCount }` sorted
   *          by `openTicketCount` ascending.
   * @throws {NotFoundException} When the project does not exist.
   */
  async getProjectWorkload(
    projectId: number,
  ): Promise<{ userId: number; username: string; openTicketCount: number }[]> {
    await this.projectService.findOne(projectId);

    const rows = await this.userRepository
      .createQueryBuilder('user')
      .leftJoin(
        'tickets',
        'ticket',
        'ticket."assigneeId" = user.id AND ticket."projectId" = :projectId AND ticket.status != :done AND ticket."deletedAt" IS NULL',
        { projectId, done: TicketStatus.DONE },
      )
      .where('user.role = :role', { role: Role.DEVELOPER })
      .select('user.id', 'userId')
      .addSelect('user.username', 'username')
      .addSelect('COUNT(ticket.id)', 'openTicketCount')
      .groupBy('user.id')
      .addGroupBy('user.username')
      .orderBy('COUNT(ticket.id)', 'ASC')
      .getRawMany<{ userId: number; username: string; openTicketCount: string }>();

    return rows.map((r) => ({
      userId: Number(r.userId),
      username: r.username,
      openTicketCount: Number(r.openTicketCount),
    }));
  }

  // ── CSV Export / Import ─────────────────────────────────────────

  /** Columns included in CSV export and expected on import (TDP 3.4). */
  private static readonly CSV_COLUMNS = [
    'id',
    'title',
    'description',
    'status',
    'priority',
    'type',
    'assigneeId',
  ] as const;

  /**
   * Exports all active tickets for a project as a CSV string.
   *
   * @param projectId - The project whose tickets to export.
   * @returns A CSV string with header row and one row per ticket.
   * @throws {NotFoundException} When the project does not exist.
   */
  async exportToCsv(projectId: number): Promise<string> {
    await this.projectService.findOne(projectId);
    const tickets = await this.ticketRepository.find({
      where: { projectId },
    });

    const rows = tickets.map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      type: t.type,
      assigneeId: t.assigneeId ?? '',
    }));

    return stringify(rows, {
      header: true,
      columns: [...TicketService.CSV_COLUMNS],
    });
  }

  /**
   * Imports tickets from a CSV buffer into a project.
   *
   * Rows are validated like **`CreateTicketDto`**: lengths, enums, optional
   * **`assigneeId`** checked as an integer referencing an existing user.
   * Invalid rows increment **`failed`** and **`errors`**; valid rows persist.
   * More than {@link MAX_TICKET_CSV_IMPORT_ROWS} **data rows** (after the header)
   * or malformed CSV causes **`BadRequestException`** — no partial import in those cases.
   *
   * @param projectId         - The target project for imported tickets.
   * @param fileBuffer        - Raw CSV bytes from the uploaded file.
   * @param importedByUserId  - Authenticated user performing the import (audit `performedBy`).
   * @returns A summary with counts of created/failed rows and error messages.
   * @throws {NotFoundException} When the project does not exist.
   * @throws {BadRequestException} When the CSV exceeds the allowed row count or cannot be parsed.
   */
  async importFromCsv(
    projectId: number,
    fileBuffer: Buffer,
    importedByUserId: number,
  ): Promise<CsvImportSummary> {
    await this.projectService.findOne(projectId);

    const validStatuses = new Set(Object.values(TicketStatus));
    const validPriorities = new Set(Object.values(TicketPriority));
    const validTypes = new Set(Object.values(TicketType));

    let created = 0;
    let failed = 0;
    const errors: CsvImportRowError[] = [];

    let records: Record<string, string>[];
    try {
      records = await this.parseCsvStream(fileBuffer);
    } catch (error: unknown) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new BadRequestException('Invalid CSV format');
    }

    if (records.length > MAX_TICKET_CSV_IMPORT_ROWS) {
      throw new BadRequestException(
        `Ticket CSV exceeds the maximum of ${MAX_TICKET_CSV_IMPORT_ROWS} data rows`,
      );
    }

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2;
      const rowFieldErrors: CsvImportRowError[] = [];

      // id / projectId may appear in the file — never used for persistence (new rows only).

      const title = (row['title'] ?? '').trim();
      const description = (row['description'] ?? '').trim();
      const statusRaw = (row['status'] ?? '').trim();
      const priorityRaw = (row['priority'] ?? '').trim();
      const typeRaw = (row['type'] ?? '').trim();
      const assigneeRaw = (row['assigneeId'] ?? '').trim();
      const titleForError = title.length > 0 ? title : '(untitled)';

      if (!title) {
        rowFieldErrors.push({
          row: rowNum,
          title: titleForError,
          field: 'title',
          message: 'title is required',
        });
      } else if (title.length > CREATE_TICKET_TITLE_MAX_LEN) {
        rowFieldErrors.push({
          row: rowNum,
          title,
          field: 'title',
          message: `title must be shorter than or equal to ${CREATE_TICKET_TITLE_MAX_LEN} characters`,
        });
      }

      if (!description) {
        rowFieldErrors.push({
          row: rowNum,
          title: titleForError,
          field: 'description',
          message: 'description is required',
        });
      } else if (description.length > CREATE_TICKET_DESCRIPTION_MAX_LEN) {
        rowFieldErrors.push({
          row: rowNum,
          title: titleForError,
          field: 'description',
          message: `description must be shorter than or equal to ${CREATE_TICKET_DESCRIPTION_MAX_LEN} characters`,
        });
      }

      if (!validStatuses.has(statusRaw as TicketStatus)) {
        rowFieldErrors.push({
          row: rowNum,
          title: titleForError,
          field: 'status',
          message: csvStatusMessage(statusRaw),
        });
      }
      if (!validPriorities.has(priorityRaw as TicketPriority)) {
        rowFieldErrors.push({
          row: rowNum,
          title: titleForError,
          field: 'priority',
          message: csvPriorityMessage(priorityRaw),
        });
      }
      if (!validTypes.has(typeRaw as TicketType)) {
        rowFieldErrors.push({
          row: rowNum,
          title: titleForError,
          field: 'type',
          message: csvTypeMessage(typeRaw),
        });
      }

      let assigneeId: number | null = null;
      if (assigneeRaw.length > 0) {
        if (!/^-?\d+$/.test(assigneeRaw)) {
          rowFieldErrors.push({
            row: rowNum,
            title: titleForError,
            field: 'assigneeId',
            message: 'assigneeId must be a valid integer',
          });
        } else {
          const parsedAssignee = Number(assigneeRaw);
          if (!Number.isSafeInteger(parsedAssignee)) {
            rowFieldErrors.push({
              row: rowNum,
              title: titleForError,
              field: 'assigneeId',
              message: 'assigneeId must be a valid integer',
            });
          } else {
            assigneeId = parsedAssignee;
          }
        }
      }

      if (rowFieldErrors.length > 0) {
        failed++;
        errors.push(...rowFieldErrors);
        continue;
      }

      if (assigneeId !== null) {
        try {
          await this.userService.findOne(assigneeId);
        } catch (error: unknown) {
          if (error instanceof NotFoundException) {
            failed++;
            errors.push({
              row: rowNum,
              title,
              field: 'assigneeId',
              message: `Assignee with ID ${assigneeId} does not exist`,
            });
            continue;
          }
          throw error;
        }
      }

      const ticket = this.ticketRepository.create({
        title,
        description,
        status: statusRaw as TicketStatus,
        priority: priorityRaw as TicketPriority,
        type: typeRaw as TicketType,
        projectId,
        assigneeId,
      });

      try {
        const saved = await this.ticketRepository.save(ticket);
        await this.auditLogService.log({
          action: AuditAction.CREATE,
          entityType: 'TICKET',
          entityId: saved.id,
          performedBy: importedByUserId,
          actor: 'USER',
        });
        if (saved.assigneeId === null) {
          await this.autoAssign(saved);
        }
        created++;
      } catch {
        failed++;
        errors.push({
          row: rowNum,
          title,
          field: 'row',
          message:
            'Unable to persist ticket row. Please verify the data and try again.',
        });
      }
    }

    return { created, failed, errors };
  }

  /**
   * Parses a CSV buffer using a stream-based parser to keep memory
   * consumption proportional to the current row rather than the
   * entire file.
   */
  private parseCsvStream(
    buffer: Buffer,
  ): Promise<Record<string, string>[]> {
    return new Promise((resolve, reject) => {
      const records: Record<string, string>[] = [];
      const stream = Readable.from(buffer);
      const parser = stream.pipe(
        parse({ columns: true, skip_empty_lines: true, trim: true }),
      );
      parser.on('data', (row: Record<string, string>) => records.push(row));
      parser.on('end', () => resolve(records));
      parser.on('error', () => {
        reject(new BadRequestException('Invalid CSV format'));
      });
    });
  }

  // ── Dependency management ──────────────────────────────────────

  /**
   * Adds a blocker dependency to a ticket.
   *
   * Both tickets must exist and belong to the same project.
   * A ticket cannot block itself, and duplicate dependencies are rejected.
   *
   * @param ticketId - The ticket that is being blocked.
   * @param dto      - Contains the `blockedBy` ticket ID.
   * @throws {NotFoundException} When either ticket does not exist.
   * @throws {BadRequestException} When the tickets belong to different projects,
   *         a ticket tries to block itself, or the dependency already exists.
   */
  async addDependency(ticketId: number, dto: AddDependencyDto): Promise<void> {
    if (ticketId === dto.blockedBy) {
      throw new BadRequestException('A ticket cannot block itself');
    }

    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: ['blockedBy'],
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    const blocker = await this.findOne(dto.blockedBy);

    if (ticket.projectId !== blocker.projectId) {
      throw new BadRequestException(
        'Both tickets must belong to the same project',
      );
    }

    if (ticket.blockedBy.some((b) => b.id === dto.blockedBy)) {
      throw new BadRequestException(
        `Ticket ${ticketId} is already blocked by ticket ${dto.blockedBy}`,
      );
    }

    if (await this.wouldCreateCircularDependency(ticketId, dto.blockedBy)) {
      throw new BadRequestException(
        `Cannot add dependency: Ticket ${ticketId} is already blocking Ticket ${dto.blockedBy}, creating a circular dependency loop.`,
      );
    }

    ticket.blockedBy.push(blocker);
    await this.ticketRepository.save(ticket);
  }

  /**
   * Returns true when adding `blockedById` as a blocker of `ticketId`
   * would create a direct or transitive circular dependency loop.
   *
   * Walks the existing blocker chain starting from `blockedById`; if
   * `ticketId` is reachable, the proposed edge would close a cycle.
   */
  private async wouldCreateCircularDependency(
    ticketId: number,
    blockedById: number,
  ): Promise<boolean> {
    const visited = new Set<number>();
    const queue: number[] = [blockedById];

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      if (currentId === ticketId) {
        return true;
      }
      if (visited.has(currentId)) {
        continue;
      }
      visited.add(currentId);

      const current = await this.ticketRepository.findOne({
        where: { id: currentId },
        relations: ['blockedBy'],
      });
      if (!current) {
        continue;
      }

      for (const blocker of current.blockedBy) {
        queue.push(blocker.id);
      }
    }

    return false;
  }

  /**
   * Returns all tickets that block the given ticket.
   *
   * @param ticketId - The ticket whose blockers to retrieve.
   * @returns An array of blocking {@link Ticket} entities (id, title, status).
   * @throws {NotFoundException} When the ticket does not exist.
   */
  async getDependencies(ticketId: number): Promise<Ticket[]> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: ['blockedBy'],
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }
    return ticket.blockedBy;
  }

  /**
   * Removes a blocker dependency from a ticket.
   *
   * @param ticketId  - The ticket that is being blocked.
   * @param blockerId - The blocker ticket to remove.
   * @throws {NotFoundException} When the ticket does not exist or the dependency is not found.
   */
  async removeDependency(
    ticketId: number,
    blockerId: number,
  ): Promise<void> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: ['blockedBy'],
    });
    if (!ticket) {
      throw new NotFoundException(`Ticket with ID ${ticketId} not found`);
    }

    const original = ticket.blockedBy.length;
    ticket.blockedBy = ticket.blockedBy.filter((b) => b.id !== blockerId);

    if (ticket.blockedBy.length === original) {
      throw new NotFoundException(
        `Dependency on blocker ${blockerId} not found for ticket ${ticketId}`,
      );
    }

    await this.ticketRepository.save(ticket);
  }
}

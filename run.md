# IssueFlow — Setup, Build & Run Instructions

## Prerequisites

| Tool       | Version  | Purpose                         |
|------------|----------|---------------------------------|
| Node.js    | ≥ 18     | Runtime for the NestJS app      |
| npm        | ≥ 9      | Package management              |
| Docker     | ≥ 24     | Runs the PostgreSQL container   |

---

## 1. Install Dependencies

```bash
npm install
```

## 2. Environment Configuration

Create a `.env` file in the project root (or copy from `.env.example`) with the following variables:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=issueflow
DB_PASSWORD=issueflow
DB_NAME=issueflow
DB_SYNCHRONIZE=true
JWT_SECRET=your-secret-key
JWT_EXPIRATION=3600
```

## 3. Start the PostgreSQL Database

The project ships with a `compose.yml` that spins up a local PostgreSQL instance.

```bash
docker compose up -d
```

This creates a container with:

| Parameter | Value      |
|-----------|------------|
| Host      | localhost  |
| Port      | 5432       |
| User      | issueflow  |
| Password  | issueflow  |
| Database  | issueflow  |

To verify it is running:

```bash
docker compose ps
```

## 4. Run the Application

### Development (watch mode)

```bash
npm run start:dev
```

### Production

```bash
npm run build
npm run start:prod
```

The server listens on **http://localhost:3000**.

### Initial Admin Seed

On first startup, if the `users` table is empty, the application automatically seeds an administrator account:

| Field    | Value               |
|----------|---------------------|
| Username | `admin`             |
| Password | `secret`            |
| Email    | `admin@issueflow.com` |
| Role     | `ADMIN`             |

Use these credentials with `POST /auth/login` to obtain a JWT and begin creating additional users.

> **Note:** Any user created via `POST /users` without an explicit `password` field will default to the password `secret`.

## 5. Swagger (OpenAPI) Documentation

Once the server is running, open the interactive API documentation at:

**http://localhost:3000/api**

Use the **Authorize** button (top-right) to enter a Bearer JWT token and test protected endpoints directly from the browser.

## 6. Run the Tests

### Unit tests

```bash
npm run test
```

### Watch mode

```bash
npm run test:watch
```

### Coverage report

```bash
npm run test:cov
```

### TypeScript strict compilation check

```bash
npx tsc --noEmit
```

---

## Implemented Features

### Phase 1 — User Management

- **TypeORM** configured with `@nestjs/config` for environment-driven database connection. `synchronize` gated by `DB_SYNCHRONIZE` env variable.
- **Global `ValidationPipe`** enabled with `whitelist`, `forbidNonWhitelisted`, and `transform`.
- **Strict TypeScript** (`strict: true`, `strictNullChecks: true`, `noImplicitAny: true`).
- **User Module** (`src/user/`):
  - `User` entity — `id`, `username` (unique), `email` (unique), `fullName`, `password` (hashed, select: false), `role` (ADMIN | DEVELOPER), `createdAt`, `updatedAt`.
  - `CreateUserDto` / `UpdateUserDto` — validated with `class-validator`, `@Transform` for trim/lowercase.
  - `UserService` — CRUD with `ConflictException` (409) for duplicate keys.
  - `UserController` — REST endpoints:
    - `GET /users`, `GET /users/:userId`, `POST /users`, `POST /users/update/:userId`, `DELETE /users/:userId`

### Phase 2 — Authentication (JWT) & Projects

- **Auth Module** (`src/auth/`):
  - JWT-based authentication with `@nestjs/jwt` and `passport-jwt`.
  - `POST /auth/login` — validates credentials, returns signed JWT.
  - `GET /auth/me` — returns authenticated user profile.
  - `POST /auth/logout` — server-side token revocation via in-memory deny-list (TDP 2.2).
  - `JwtStrategy` checks revocation registry on every request; revoked tokens receive 401.
  - Global `JwtAuthGuard` protects all endpoints except `POST /auth/login`.
  - `@Public()` decorator to exempt specific routes.
- **Role-Based Authorization (RBAC)**:
  - `@Roles()` decorator and `RolesGuard` for route-level access control.
  - Admin-only routes: `POST /users`, `DELETE /users/:userId`, soft-deleted listings, restores.
- **Global `ClassSerializerInterceptor`** for `@Exclude()` on sensitive fields.
- **Project Module** (`src/project/`):
  - `Project` entity — `id`, `name`, `description`, `ownerId` (FK → User, `onDelete: RESTRICT`), `createdAt`, `updatedAt`, `deletedAt` (soft-delete).
  - REST endpoints:
    - `GET /projects`, `GET /projects/:projectId`, `POST /projects`, `PATCH /projects/:projectId`, `DELETE /projects/:projectId`, `POST /projects/:projectId/restore`
  - `GET /projects/:projectId/workload` — developer workload data.

### Phase 3a — Tickets, Comments & Mentions

- **Ticket Module** (`src/ticket/`):
  - `Ticket` entity — `id`, `title`, `description`, `status` (TODO | IN_PROGRESS | IN_REVIEW | DONE), `priority` (LOW | MEDIUM | HIGH | CRITICAL), `type` (BUG | FEATURE | TECHNICAL), `projectId`, `assigneeId`, `dueDate`, `isOverdue`, `version` (@VersionColumn), `createdAt`, `updatedAt`, `deletedAt`.
  - Status lifecycle enforced: forward-only transitions (TODO → IN_PROGRESS → IN_REVIEW → DONE); no updates on DONE tickets.
  - Optimistic locking: `@VersionColumn` with `ConflictException` (409) on version mismatch (TDP 2.4).
  - REST endpoints:
    - `GET /tickets?projectId=`, `GET /tickets/deleted?projectId=`, `GET /tickets/:ticketId`, `POST /tickets`, `PATCH /tickets/:ticketId`, `DELETE /tickets/:ticketId`, `POST /tickets/:ticketId/restore`
- **Comment Module** (`src/comment/`):
  - `Comment` entity — `id`, `ticketId`, `authorId`, `content`, `mentionedUsers` (ManyToMany → User), `version` (@VersionColumn), `createdAt`, `updatedAt`.
  - `@username` mention parsing and resolution.
  - Author derived from JWT payload (not client body) to prevent spoofing.
  - Optimistic locking with `ConflictException` (409) on version mismatch (TDP 2.5).
  - REST endpoints:
    - `GET /tickets/:ticketId/comments`, `POST /tickets/:ticketId/comments`, `PATCH /tickets/:ticketId/comments/:commentId`, `DELETE /tickets/:ticketId/comments/:commentId`
  - `GET /users/:userId/mentions` — paginated, sorted newest-first (TDP 3.6).

### Phase 3b — Dependencies, Attachments & CSV

- **Ticket Dependencies**:
  - Self-referencing ManyToMany (`blockedBy`) relation.
  - `POST /tickets/:ticketId/dependencies`, `GET /tickets/:ticketId/dependencies`, `DELETE /tickets/:ticketId/dependencies/:blockerId`.
  - Constraints: both tickets must exist and belong to the same project.
  - DONE transition blocked if unresolved blockers exist (single efficient COUNT query).
- **Attachment Module** (`src/attachment/`):
  - `Attachment` entity — `id`, `filename`, `contentType`, `size`, `ticketId`, `createdAt`.
  - `POST /tickets/:ticketId/attachments` — multipart upload with `ParseFilePipe` (10 MB max, restricted MIME types). Path traversal protection via `path.basename()`.
  - `DELETE /tickets/:ticketId/attachments/:attachmentId`.
- **CSV Export & Import**:
  - `GET /tickets/export?projectId=` — downloadable CSV with 7 TDP-specified fields: id, title, description, status, priority, type, assigneeId.
  - `POST /tickets/import` — stream-based CSV parser, per-row validation, partial success with summary `{ created, failed, errors }`.

### Phase 4 — Auto-Escalation, Auto-Assignment & Audit Logs

- **Auto-Assignment** (on ticket creation):
  - When `assigneeId` is null, finds DEVELOPER users in the project with least open ticket workload.
  - Tie-break by registration order. Logs `AUTO_ASSIGN` audit entry with `actor: 'SYSTEM'`.
- **Auto-Escalation Scheduler** (`src/escalation/`):
  - `@nestjs/schedule` cron job (runs every minute).
  - Stepwise priority escalation: LOW → MEDIUM → HIGH → CRITICAL for overdue tickets.
  - `isOverdue` set to `true` only when CRITICAL and overdue; manual priority change resets it.
  - Concurrency guard (`isRunning` flag with `try/finally`).
  - Bulk `ticketRepository.save()` and `auditLogService.logMany()` for efficiency.
- **Audit Log Module** (`src/audit-log/`):
  - `AuditLog` entity — `id`, `action` (enum), `entityType`, `entityId`, `performedBy` (FK → User, nullable), `actor` (USER | SYSTEM), `timestamp`.
  - `GET /audit-logs` — query filters: `entityType`, `entityId`, `action`, `actor`.
  - Fault-tolerant logging: `AuditLogService.log()` wraps persistence in `try/catch` to never crash user-facing requests.
  - Integrated across all state-changing operations (User, Project, Ticket, Comment CRUD; auto-escalation; auto-assignment).

### Swagger (OpenAPI) Integration

- `@nestjs/swagger@7` with NestJS CLI plugin for automatic DTO introspection.
- API metadata: Title "IssueFlow API", Version "1.0", Bearer Auth support.
- Swagger UI served at `/api`.
- All controllers decorated with `@ApiTags` and `@ApiBearerAuth`.
- File upload endpoints annotated with `@ApiConsumes('multipart/form-data')` and `@ApiBody`.

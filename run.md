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

Use these credentials with `POST /auth/login` to obtain a JWT.

**Onboarding / user lifecycle (TDP):**

1. **First login:** `POST /auth/login` with **`admin` / `secret`** (the seeded **`ADMIN`** — self-registration is not supported).
2. **Create users:** Call **`POST /users`** with **`Authorization: Bearer <JWT>`** — the caller must be **`ADMIN`**. The JSON body **must** include **`password`** (plain text, at least **8** characters after trimming). The server stores a **bcrypt hash** and **never** returns `password` in the response.
3. **Delete users:** **`DELETE /users/:userId`** requires the same **`ADMIN`** Bearer token. **`DEVELOPER`** callers and anonymous requests receive **403** (mirrors **`POST /users`** access control).
4. **Update profiles:** **`POST /users/update/:userId`** — **`ADMIN`** may edit **`fullName`** and **`role`** for **any** user. **`DEVELOPER`** users may edit **only their own** **`fullName`** and **must omit** **`role`** from the JSON (**403** with **`This action requires administrator privileges`** if **`role`** is present; **403** **`Users can only update their own profile`** if `:userId` is not theirs). Unauthenticated callers are rejected by JWT (**401**).
5. **New user login:** Authenticate with `POST /auth/login` using the **username and password** supplied in step 2 (for accounts created via **`POST /users`**).

> **Note:** Only the bootstrap **admin** account is created without `POST /users`. All other users must be created by an **ADMIN** via **`POST /users`** with an explicit **`password`** field. Only **`ADMIN`** may remove users via **`DELETE /users/:userId`**. **`POST /users/update/:userId`** follows the **ADMIN** vs **`DEVELOPER`** rules listed in step 4.

## 5. Swagger (OpenAPI) Documentation

Once the server is running, open the interactive API documentation at:

**http://localhost:3000/api**

Use the **Authorize** button (top-right) to enter a Bearer JWT token and test protected endpoints directly from the browser.

## 6. Run the Tests

### Unit tests

```bash
npm run test
```

This runs **all** `*.spec.ts` files under `src/`, including the full-flow **`src/integration/issueflow-flow.integration.spec.ts`** harness (`Test.createTestingModule` with mocked TypeORM repositories). Any service under test that injects **`DataSource`** (for example **`TicketService`**, **`CommentService`**) must have a **`DataSource`** stub in that module’s `providers`; missing core providers can surface as deep Nest injector errors rather than a clear “cannot resolve dependency” message.

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

## 7. End-to-End Curl Testing

The project includes a `tests.sh` shell script that exercises **every** API endpoint defined in the README contract tables using pure `curl` commands. The script authenticates with the seeded admin account, creates test data, and walks through all 11 API sections sequentially.

The script is **fully idempotent** — safe to run multiple times against the same database. If a resource already exists (e.g., `409 Conflict`), it automatically falls back to a `GET` request to resolve the existing resource ID instead of failing.

### Prerequisites

| Tool   | Purpose                                   |
|--------|-------------------------------------------|
| curl   | HTTP requests                             |
| jq     | JSON parsing (for token/ID extraction)    |

### Run the script

```bash
bash tests.sh
```

By default the script targets `http://localhost:3000`. Override with the `BASE_URL` environment variable:

```bash
BASE_URL=http://localhost:4000 bash tests.sh
```

### What it covers

| # | Section               | Endpoints Tested |
|---|-----------------------|------------------|
| 1 | Authentication        | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| 2 | Users                 | `POST /users`, `GET /users`, `GET /users/:userId`, `POST /users/update/:userId`, `DELETE /users/:userId` |
| 3 | Projects              | `POST /projects`, `GET /projects`, `GET /projects/:projectId`, `PATCH /projects/:projectId`, `DELETE /projects/:projectId` |
| 4 | Tickets               | `POST /tickets`, `GET /tickets?projectId=`, `GET /tickets/:ticketId`, `PATCH /tickets/:ticketId`, `DELETE /tickets/:ticketId`, `GET /tickets/export?projectId=`, `POST /tickets/import` |
| 5 | Comments              | `POST /tickets/:ticketId/comments`, `GET /tickets/:ticketId/comments`, `PATCH /tickets/:ticketId/comments/:commentId`, `DELETE /tickets/:ticketId/comments/:commentId` |
| 6 | Audit Logs            | `GET /audit-logs` (unfiltered + 4 query-param filters) |
| 7 | Dependencies          | `POST /tickets/:ticketId/dependencies`, `GET /tickets/:ticketId/dependencies`, `DELETE /tickets/:ticketId/dependencies/:blockerId` |
| 8 | Attachments           | `POST /tickets/:ticketId/attachments`, `DELETE /tickets/:ticketId/attachments/:attachmentId` |
| 9 | Mentions              | `GET /users/:userId/mentions` (default + paginated) |
| 10 | Workload             | `GET /projects/:projectId/workload` |
| 11 | Soft Delete          | `GET /tickets/deleted?projectId=`, `POST /tickets/:ticketId/restore`, `GET /projects/deleted`, `POST /projects/:projectId/restore` |

Each `curl` command prints the HTTP status code alongside the expected status, and the response body for visual comparison against the README contract.

**Concurrent ticket updates:** The contract script exercises a single sequential `PATCH /tickets/:ticketId`. Behavior under overlap is enforced in the ticket service layer (PostgreSQL `FOR UPDATE NOWAIT` → **409 Conflict** with the generic message quoted in Phase 3a below). To confirm manually, run two overlapping PATCH requests against the same ticket ID (for example two terminal tabs with Bearer tokens); both should remain valid sequentially, without both commits applying blindly to the same in-flight logical update.

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
  - Admin-only routes: soft-deleted listings, restores.
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
  - **`PATCH /tickets/:ticketId` concurrency:** The service opens a PostgreSQL transaction, loads the ticket with **row-level pessimistic write locking** (`SELECT ... FOR UPDATE NOWAIT`). If another request already holds that row lock, PostgreSQL raises **SQLSTATE `55P03`**, which is mapped to **HTTP 409 Conflict** with the generic message: *"The system was unable to process your request at this moment. Please try again in a few moments."* No request/response body fields are added; `GET /tickets/:ticketId` continues to read the latest **committed** state without using this lock.
  - Optimistic locking: `@VersionColumn` with `ConflictException` (409) on version mismatch (TDP 2.4).
  - REST endpoints:
    - `GET /tickets?projectId=`, `GET /tickets/deleted?projectId=`, `GET /tickets/:ticketId`, `POST /tickets`, `PATCH /tickets/:ticketId`, `DELETE /tickets/:ticketId`, `POST /tickets/:ticketId/restore`
- **Comment Module** (`src/comment/`):
  - `Comment` entity — `id`, `ticketId`, `authorId`, `content`, `mentionedUsers` (ManyToMany → User), `version` (@VersionColumn), `createdAt`, `updatedAt`.
  - `@username` mention parsing and resolution.
  - Author derived from JWT payload (not client body) to prevent spoofing on create.
  - **`PATCH` / `DELETE` authorization:** `ADMIN` may update or delete any comment; `DEVELOPER` only when `comment.authorId` matches the JWT subject. Cross-author attempts return **403 Forbidden** with message *"You are not allowed to modify this comment."* (no API shape change).
  - **`PATCH` / `DELETE` row locking:** both use a DB transaction with **`SELECT ... FOR UPDATE NOWAIT`** scoped by `commentId` + `ticketId`; **SQLSTATE `55P03`** → **409 Conflict** with the shared generic try-again message (covers overlap between concurrent **`PATCH`** and **`DELETE`** as well as two deletes). Optimistic version conflicts on **`PATCH`** still use a different **409** body text.
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
  - `POST /tickets/:ticketId/attachments` — multipart upload with `ParseFilePipe`: **10 MiB max (inclusive)**; **TDP 3.3 MIME allowlist** enforced on **`file.mimetype`** (**`image/png`**, **`image/jpeg`**, **`application/pdf`**, **`text/plain`** — including values with parameters such as `text/plain; charset=utf-8`). **`image/jpg`** is **not** accepted (use **`image/jpeg`**). Validation is explicit allowlisting, not Nest’s buffer/magic-number **`FileTypeValidator`**, so plain-text uploads are not falsely rejected. Path traversal protection via `path.basename()` on the stored filename.
  - `DELETE /tickets/:ticketId/attachments/:attachmentId`.
- **CSV Export & Import**:
  - `GET /tickets/export?projectId=` — downloadable CSV with **exactly 7** TDP-specified fields: id, title, description, status, priority, type, assigneeId (no extra columns).
  - `POST /tickets/import` (`multipart/form-data`: **`file`** + **`projectId`**) — CSV parser loads rows with header semantics (`columns: true`); **`projectId`** is always taken from the form field for every row (CSV does not require a **`projectId`** column; any such column values are ignored). If a **`id`** column appears, it is **ignored** — imported rows always create **new** tickets with database-generated IDs. **Limits:** **`text/csv`** MIME type validation, **`originalname`** must end with `.csv`, **maximum file size 10 MB** (inclusive — same magnitude as attachments), **maximum 10,000 data rows** (excluding header; imports over this limit fail entirely with **400 Bad Request**, no partial import). Malformed CSV or parse errors return **400** with `"Invalid CSV format"`. Row-level failures use the existing summary `{ created, failed, errors }` with validations aligned to **`POST /tickets`** / **`CreateTicketDto`** (title/description length bounds, enums, optional **`assigneeId`** validated as integer and existing user). **`DONE`** is allowed on import. Dependencies are **not** evaluated during import (unchanged README contract).
  - Each successfully persisted imported row records a **`CREATE`** audit for **`TICKET`** with `actor: USER` and `performedBy` set to the authenticated importer’s `userId` (before optional auto-assignment **`AUTO_ASSIGN`**).

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
  - Integrated across all state-changing operations (User, Project, Ticket, Comment CRUD; ticket dependency and attachment mutations; CSV import—one **`TICKET` `CREATE`** per successful imported row; soft-delete restores; auto-escalation; auto-assignment).

### Phase 5 — Contract Drift, User Cascade Delete & Dependency Loop Prevention

- **Empty mutating response bodies (README P1):**
  - `POST /users/update/:userId`, `PATCH /projects/:projectId`, `PATCH /tickets/:ticketId`, and `PATCH /tickets/:ticketId/comments/:commentId` now return **200 OK** with an **empty body** (`void`). Controllers delegate to services, write audit logs, and omit entity serialization. **`POST /users`** still returns the created user (including **`password`** in the request DTO only — unchanged per reviewer override).
- **Secure user hard-delete cascade (no new routes):**
  - `UserService.remove()` runs in a single DB transaction before hard-delete:
    1. **Project owner reassignment** — projects where `ownerId = :userId` are reassigned to the bootstrap **`admin`** account (`username: admin`).
    2. **Ticket assignee nullification** — tickets where `assigneeId = :userId` have assignee explicitly set to `null` (replacing silent DB `SET NULL`).
    3. **SYSTEM audit logs** — each reassigned project and each nullified ticket generates an **`UPDATE`** audit entry with `actor: 'SYSTEM'`, `performedBy: null`.
  - Bootstrap **`admin`** account cannot be deleted (**400 Bad Request**).
- **Circular ticket dependency guard:**
  - `TicketService.addDependency()` traverses the existing blocker chain from the proposed blocker before insert. Direct and transitive cycles throw **`BadRequestException`**: *"Cannot add dependency: Ticket [A] is already blocking Ticket [B], creating a circular dependency loop."*
- **Audit log visibility (business override):**
  - `GET /audit-logs` remains open to **all authenticated users** (`ADMIN` and `DEVELOPER`) — no RBAC restriction applied despite CR suggestion.
- **Tests:** controller specs assert empty PATCH/update bodies; `UserService.remove` cascade + SYSTEM audits; circular/transitive dependency rejection messages.

### Phase 6 — Comment Mention FK Safety, Cascading Project Soft Delete & Structured CSV Import Errors

- **Comment mention join-table CASCADE (schema level):**
  - `Comment.mentionedUsers` persisted via explicit {@link CommentMention} join entity (`comment_mentions`) with `onDelete: 'CASCADE'` on the `userId` FK. Hard-deleting a user removes mention **links** only — comments and their plain-text `@username` content remain intact; no FK **500** on user delete.
- **Cascading project soft-delete / restore:**
  - `ProjectService.softRemove()` runs in a single transaction: soft-deletes all **active** tickets for the project, then soft-deletes the project.
  - `ProjectService.restore()` runs in a single transaction: restores the project, then restores all soft-deleted tickets with matching `projectId`.
  - `GET /tickets?projectId=` continues to delegate to `ProjectService.findOne()` — soft-deleted (or missing) projects return **404** with `Project with ID N not found` before any ticket query executes.
- **Structured CSV import row errors:**
  - `POST /tickets/import` summary `errors` array entries are now objects: `{ row, title, field, message }` (e.g. invalid status → `{ "row": 4, "title": "Fix login bug", "field": "status", "message": "Invalid status: BLOCKED. Allowed values are TODO, IN_PROGRESS, IN_REVIEW, DONE." }`). Multiple field failures on one row emit one object per field; persistence failures map to a safe generic message (no raw DB strings).
- **Tests:** `project.service.spec.ts` (cascade soft-delete/restore transactions), `ticket.service.spec.ts` (soft-deleted project 404 guard + structured CSV errors), existing suite preserved.

### Swagger (OpenAPI) Integration

- `@nestjs/swagger@7` with NestJS CLI plugin for automatic DTO introspection.
- API metadata: Title "IssueFlow API", Version "1.0", Bearer Auth support.
- Swagger UI served at `/api`.
- All controllers decorated with `@ApiTags` and `@ApiBearerAuth`.
- File upload endpoints annotated with `@ApiConsumes('multipart/form-data')` and `@ApiBody`.

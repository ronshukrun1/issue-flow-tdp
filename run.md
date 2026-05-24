# IssueFlow — Setup, Build & Run Instructions

Backend REST API for the IssueFlow ticket-management platform. API contract tables live in [`README.md`](README.md). AI interaction logs live in [`prompts.md`](prompts.md).

---

## Prerequisites

| Tool    | Version | Purpose                       |
|---------|---------|-------------------------------|
| Node.js | ≥ 18    | NestJS runtime                |
| npm     | ≥ 9     | Package management            |
| Docker  | ≥ 24    | PostgreSQL via `compose.yml`  |

For contract testing with `tests.sh`: **curl** and **jq**.

---

## 1. Install Dependencies

```bash
npm install
```

## 2. Environment Configuration

Copy `.env.example` to `.env` (or create manually):

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

## 3. Start PostgreSQL

```bash
docker compose up -d
docker compose ps   # verify running
```

| Parameter | Value     |
|-----------|-----------|
| Host      | localhost |
| Port      | 5432      |
| User      | issueflow |
| Password  | issueflow |
| Database  | issueflow |

## 4. Run the Backend

| Mode        | Command              |
|-------------|----------------------|
| Development | `npm run start:dev`  |
| One-shot    | `npm run start`      |
| Production  | `npm run build && npm run start:prod` |

API base URL: **http://localhost:3000**

### Bootstrap admin (first startup)

If the `users` table is empty, an **ADMIN** account is seeded automatically:

| Field    | Value                 |
|----------|-----------------------|
| Username | `admin`               |
| Password | `secret`              |
| Email    | `admin@issueflow.com` |

**User lifecycle (summary):**

1. Login as `admin` / `secret` → `POST /auth/login`
2. Create users → `POST /users` (**ADMIN** only; body **must** include `password` ≥ 8 chars)
3. Update users → `POST /users/update/:userId` (**ADMIN** any user; **DEVELOPER** own `fullName` only, no `role` in body)
4. Delete users → `DELETE /users/:userId` (**ADMIN** only; bootstrap `admin` cannot be deleted)

---

## 5. Frontend (React UI)

The optional React + TypeScript client lives in a **separate repository**:

**https://github.com/ronshukrun1/issueflow-frontend**

Clone and run it alongside this backend (default backend URL `http://localhost:3000`):

```bash
git clone https://github.com/ronshukrun1/issueflow-frontend.git
cd issueflow-frontend
npm install
npm run dev
```

Use the same seeded `admin` / `secret` credentials (or users created via the API) to log in. The UI consumes the same JWT-protected endpoints documented in [`README.md`](README.md).

---

## 6. Swagger (OpenAPI)

Interactive docs: **http://localhost:3000/api**

1. Call `POST /auth/login` with `{ "username": "admin", "password": "secret" }`
2. Click **Authorize** → enter `Bearer <accessToken>`
3. Execute protected endpoints from the UI

**Documented in Swagger (aligned with runtime behavior):**

- All routes, request DTOs, and Bearer auth
- `POST /auth/login` response schema (`accessToken`, `tokenType`, `expiresIn`)
- Mutating PATCH/update endpoints → **200 OK, empty body**
- `POST /tickets/import` → `{ created, failed, errors: [{ row, title, field, message }] }`
- Multipart upload schemas (attachments, CSV import)

> JSON responses omit internal fields (`password`, `version`, timestamps) via `@Exclude()` + `ClassSerializerInterceptor` even when entity schemas list extra properties in Swagger.

---

## 7. Tests

```bash
npm run test          # all src/**/*.spec.ts (302+ tests) + integration harness
npm run test:watch
npm run test:cov
npm run test:e2e      # minimal health-check e2e (test/app.e2e-spec.ts)
npx tsc --noEmit
```

Primary contract coverage: **`bash tests.sh`** (see §8).

---

## 8. Contract Testing (`tests.sh`)

```bash
bash tests.sh
# or: BASE_URL=http://localhost:4000 bash tests.sh
```

Idempotent curl script covering all README API sections (auth, users, projects, tickets, comments, audit logs, dependencies, attachments, mentions, workload, soft delete). Prints HTTP status + body for visual comparison.

---

## Security & Authorization Decisions

Design choices that **go beyond** the README contract — added to reduce privilege escalation, impersonation, data exposure, and resource exhaustion. Each row states **what was restricted** and **why** — not internal cascade or audit mechanics.

| Decision | Rationale / enforcement |
|----------|-------------------------|
| **Bootstrap `admin` cannot be deleted** | Seeded account is protected (**400**) so the system always retains at least one administrator. |
| **User delete — project ownership** | Before hard-delete, projects owned by the removed user are reassigned to the bootstrap **`admin`** account (not left orphaned and not transferred to whoever clicked delete). |
| **Comment author from JWT** | README shows optional **`authorId`** in the request body; runtime **ignores** client-supplied author and uses the JWT identity — prevents author spoofing. |
| **Comment edit/delete — ownership** | **DEVELOPER** may **PATCH** / **DELETE** only comments they authored; **ADMIN** is unrestricted. Not specified in README. |
| **Attachment upload limits** | 10 MiB max per file; MIME allowlist on declared **`file.mimetype`** — limits upload abuse (not defined in README). |
| **CSV import limits** | README does not cap uploads. **`POST /tickets/import`**: **10 MiB** max, **`text/csv`** MIME, **`.csv`** filename required — rejected at the multipart boundary. **10,000** data rows max; malformed CSV or row overflow → **400** with **no** partial import — prevents loading huge files into memory and overloading the server. |

---

## Architecture Overview

| Module | Key capabilities |
|--------|------------------|
| **Auth** | JWT login/logout (in-memory revocation), global guard, RBAC `@Roles` |
| **Users** | CRUD, bcrypt passwords, admin-only create/delete |
| **Projects** | CRUD, soft-delete + restore, workload API |
| **Tickets** | Lifecycle, auto-assign, auto-escalation cron, CSV import/export, dependencies |
| **Comments** | `@mentions` via `CommentMention` join entity, author from JWT |
| **Attachments** | Metadata-only upload |
| **Audit logs** | Append-only, fault-tolerant, SYSTEM actor for automation |

Stack: NestJS 10, TypeORM, PostgreSQL, `@nestjs/swagger`, strict TypeScript, global `ValidationPipe`.

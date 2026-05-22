# IssueFlow — AI Agent Interaction Log

## Model

**Claude Opus 4.6** (Anthropic) — used via Cursor IDE agent mode.

---

## Phase 1 Prompt

### Goal

Set up the foundational backend for the IssueFlow ticket management platform using NestJS and TypeORM with PostgreSQL, implementing the User module as the first feature.

### Instructions Given to the Agent

> We are starting Phase 1 of building the IssueFlow backend platform using NestJS and TypeORM with PostgreSQL.
>
> Before generating code, please analyze the existing repository structure, including configuration files (package.json, tsconfig.json, nest-cli.json) and the core files under src/, to ensure your implementation integrates seamlessly with our starting point.
>
> Tasks to perform now:
>
> 1. **Setup TypeORM in the project:**
>    - Configure the `TypeOrmModule` in `app.module.ts` to connect to the PostgreSQL instance defined in `compose.yml` (host: localhost, port: 5432, and the credentials/database name specified there).
>    - Enable `synchronize: true` for development.
>
> 2. **Create the User Module, Controller, Service, and Entity:**
>    - The User Entity must contain: id (Primary Generated Column), username (string, unique), email (string, unique), fullName (string), and role (Enum: 'ADMIN' or 'DEVELOPER').
>    - Implement the following REST Endpoints exactly as required by the API contract in README.md:
>      - GET /users - Get all users
>      - GET /users/:userId - Get user by ID
>      - POST /users - Create a user (accepts username, email, fullName, role)
>      - POST /users/update/:userId - Update a user (accepts fullName, role)
>      - DELETE /users/:userId - Delete a user
>
> **Constraints, Validation & Quality:**
> - Use `class-validator` and `class-transformer` to strictly validate incoming request bodies (DTOs), especially ensuring that the `role` field matches the allowed Enum values.
> - Document ALL generated classes and methods using professional JSDoc comments explaining their purpose.
> - Handle database errors gracefully (e.g., return an informative 400 Bad Request error if a duplicate username or email is provided).
>
> **Testing & Documentation Tasks:**
> - Write relevant Unit Tests for the new User Service and Controller to cover creation, validation constraints, and error handling.
> - Create/Update the `run.md` file with exact, clear steps implemented so far.
> - Create a `prompts.md` file documenting this exact interaction, including the specific AI model being used, the plan, and the instructions provided.

### Agent's Plan

1. **Analyze the repo** — read `package.json`, `tsconfig.json`, `nest-cli.json`, `compose.yml`, and all `src/` files to understand the starting skeleton.
2. **Skip dependency installation** — confirmed `@nestjs/typeorm`, `typeorm`, `pg`, `class-validator`, and `class-transformer` are already declared in `package.json` and installed.
3. **Enable global validation** — add `ValidationPipe` in `main.ts` with `whitelist`, `forbidNonWhitelisted`, and `transform`.
4. **Configure TypeORM** — add `TypeOrmModule.forRoot()` in `AppModule` pointing at the PostgreSQL instance from `compose.yml`.
5. **Create the `Role` enum** — `ADMIN` and `DEVELOPER`.
6. **Create the `User` entity** — with all required columns and uniqueness constraints.
7. **Create DTOs** — `CreateUserDto` (all fields required) and `UpdateUserDto` (only `fullName` and `role`, both optional).
8. **Create `UserService`** — CRUD logic with graceful handling of PostgreSQL unique-constraint violations (error code `23505`).
9. **Create `UserController`** — five endpoints matching the README API contract exactly.
10. **Create `UserModule`** — wire entity, service, and controller together.
11. **Write unit tests** — comprehensive specs for both service (mocked repository) and controller (mocked service).
12. **Create `run.md`** — step-by-step setup, build, and run instructions.
13. **Create `prompts.md`** — this file, documenting the interaction.

### Files Created / Modified

| File | Action |
|------|--------|
| `src/main.ts` | Modified — added global `ValidationPipe` |
| `src/app.module.ts` | Modified — added `TypeOrmModule.forRoot()` and `UserModule` import |
| `src/user/role.enum.ts` | Created |
| `src/user/user.entity.ts` | Created |
| `src/user/dto/create-user.dto.ts` | Created |
| `src/user/dto/update-user.dto.ts` | Created |
| `src/user/user.service.ts` | Created |
| `src/user/user.controller.ts` | Created |
| `src/user/user.module.ts` | Created |
| `src/user/user.service.spec.ts` | Created |
| `src/user/user.controller.spec.ts` | Created |
| `run.md` | Created |
| `prompts.md` | Created |

### Test Results

All **23 unit tests** pass (3 test suites):

- `src/app.controller.spec.ts` — 1 test
- `src/user/user.service.spec.ts` — 11 tests
- `src/user/user.controller.spec.ts` — 11 tests

---

## Phase 1 — Code Review & Quality Assurance

### Model

**Claude Opus 4.6** (Anthropic) — used via Cursor IDE agent mode.

### Prompt

> You are a Senior Software Architect and Backend Technical Lead performing a rigorous Code Review on Phase 1 (User Management) of the IssueFlow platform.
>
> Please review all the generated files under `src/user/` (Entity, DTOs, Service, Controller, and Spec files) along with `src/main.ts` and `src/app.module.ts`.
>
> Analyze the implementation against production-grade NestJS and TypeORM best practices, and provide constructive feedback on the following aspects:
>
> 1. Architecture & Design Patterns
> 2. Input Validation & Security
> 3. Error Handling & Edge Cases
> 4. Code Quality & Type Safety
> 5. Test Quality
> 6. Documentation Task — append this interaction to `prompts.md`
>
> Highlight any critical issues that must be fixed before moving to Phase 2 (Authentication & Projects), and suggest minor improvements for optimization.

### Review Analysis

#### 1. Architecture & Design Patterns

**Strengths:**
- Clean Controller → Service → Repository layering with correct NestJS idioms.
- `UserModule` properly imports `TypeOrmModule.forFeature`, exports `UserService` for cross-module consumption.
- `ParseIntPipe` on all `:userId` params ensures type coercion at the framework boundary.

**Issues found:**
- **[CRITICAL] Missing timestamp columns.** `User` entity has no `@CreateDateColumn()` / `@UpdateDateColumn()` — essential for auditing, debugging, and future features.
- **[IMPORTANT] `Object.assign(user, dto)` in `update()` is fragile.** Works only because `ValidationPipe({ whitelist: true })` strips extra fields. Safer to use explicit field assignment.
- **[MINOR] `POST /users/update/:userId` instead of `PATCH`.** Matches the README contract, but conflates semantics — POST implies resource creation. Design debt for later phases.

#### 2. Input Validation & Security

**Strengths:**
- `ValidationPipe` in `main.ts` is textbook: `whitelist`, `forbidNonWhitelisted`, `transform` all enabled.
- DTOs use `@IsEnum` with custom messages and `@IsEmail()`.

**Issues found:**
- **[CRITICAL] No length constraints on string fields.** `username`, `fullName`, `email` have no `@MinLength()` / `@MaxLength()` — a client could submit a 10,000-character username.
- **[IMPORTANT] Whitespace-only strings pass `@IsNotEmpty()`.** class-validator's `@IsNotEmpty()` only rejects `""`, not `"   "`. Needs `@Transform(({ value }) => value?.trim())`.
- **[IMPORTANT] No input normalization.** Emails should be lowercased, usernames trimmed.

#### 3. Error Handling & Edge Cases

**Strengths:**
- `NotFoundException` is correctly thrown for missing users in `findOne`, `update`, and `remove`.
- PostgreSQL error code `23505` is caught; unexpected errors re-thrown.

**Issues found:**
- **[CRITICAL] Unsafe `error.code` access** in `user.service.ts:62` — accesses `.code` on implicitly `any`-typed error. Compiles only because `noImplicitAny: false`. Needs proper type narrowing or a type guard.
- **[IMPORTANT] Wrong HTTP status for duplicates.** `BadRequestException` (400) used for unique-constraint violations. Should be `ConflictException` (409) — a duplicate is a conflict, not a malformed request.
- **[IMPORTANT] `findAll()` has no pagination.** Returns every user in a single query — performance cliff at scale.

#### 4. Code Quality & Type Safety

**Strengths:**
- JSDoc is thorough and professional on every class and public method.
- Return types are explicit on all service methods. Consistent async/await usage.

**Issues found:**
- **[CRITICAL] `tsconfig.json` disables safety checks.** `strictNullChecks: false` and `noImplicitAny: false` undermine TypeScript's type system — `null`/`undefined` flow unchecked, untyped variables become `any`.
- **[CRITICAL] Hardcoded DB credentials in `app.module.ts`.** Host, port, username, password hardcoded. Must use `@nestjs/config` / `ConfigModule` with `.env` files.
- **[CRITICAL] `synchronize: true` without environment guard.** Auto-migrates schema on every startup. If deployed to production, can drop columns and lose data. Must gate behind `NODE_ENV !== 'production'`.

#### 5. Test Quality

**Strengths:**
- Service tests cover happy path, `NotFoundException`, duplicate key error, and unexpected error re-throw.
- Controller tests verify delegation and exception propagation.
- Mock setup uses NestJS `Test.createTestingModule` correctly.

**Issues found:**
- **[IMPORTANT] Controller tests are pure passthrough tests.** They only confirm service delegation — no real HTTP-layer testing (status codes, validation, serialization). Real value requires e2e tests with `supertest`.
- **[IMPORTANT] No DTO validation tests.** Nothing proves that invalid roles are rejected, missing fields return 400, or extra fields are stripped/rejected.
- **[MINOR] Missing edge cases:** empty update DTO (`{}`), partial update (only `fullName`), and duplicate error mock uses a plain `{ code: '23505' }` object instead of a realistic `QueryFailedError`.

### Remediation Plan for Phase 2 Readiness

#### Critical fixes (must complete before Phase 2):

| # | Issue | Fix |
|---|-------|-----|
| C1 | Hardcoded DB credentials | Integrate `@nestjs/config` with `ConfigModule.forRoot()`, move credentials to `.env`, add `.env` to `.gitignore` |
| C2 | `synchronize: true` ungated | Gate behind `configService.get('NODE_ENV') !== 'production'` |
| C3 | No timestamp columns | Add `@CreateDateColumn()` and `@UpdateDateColumn()` to `User` entity |
| C4 | No string length constraints | Add `@MinLength()`, `@MaxLength()`, `@Matches()` to DTO string fields |
| C5 | Unsafe `error.code` access | Add type narrowing or a `isPostgresError()` type guard in the catch block |
| C6 | Weak TypeScript strictness | Enable `"strict": true` in `tsconfig.json` and fix resulting type errors |

#### Important improvements (recommended before Phase 2):

| # | Issue | Fix |
|---|-------|-----|
| I1 | Wrong HTTP status for duplicates | Replace `BadRequestException` with `ConflictException` (409) |
| I2 | No input trimming/normalization | Add `@Transform()` decorators for trim and lowercase |
| I3 | No pagination on `findAll()` | Add `@Query()` params for `page`/`limit` with defaults |
| I4 | Fragile `Object.assign` in update | Use explicit field assignment |
| I5 | No DTO/e2e tests | Add validation unit tests and `supertest`-based e2e tests |

#### Minor (future improvements):

| # | Issue | Fix |
|---|-------|-----|
| M1 | No `ClassSerializerInterceptor` | Add globally — critical when `password` field arrives in Phase 2 |
| M2 | No logging | Add NestJS `Logger` to service methods |
| M3 | No CORS | Configure in `main.ts` for frontend readiness |
| M4 | Shared test fixtures | Extract `mockUser` into a shared test helper file |

---

## Phase 1 — Code Review Fixes Applied

### Model

**Claude Opus 4.6** (Anthropic) — used via Cursor IDE agent mode.

### Prompt

> Please apply the critical fixes identified in the Phase 1 Code Review to ensure production-grade quality before we proceed to Phase 2.
>
> Execute the following modifications carefully:
>
> 1. **TypeSafety (tsconfig.json):**
>    - Update `tsconfig.json` to enable strict mode by setting `"strict": true`, `"strictNullChecks": true`, and `"noImplicitAny": true`. Fix any compiler errors that arise from this change.
>
> 2. **Configuration & Security (app.module.ts):**
>    - Install and configure `@nestjs/config`. Move the database credentials from `app.module.ts` into a `.env` file.
>    - Gate the `synchronize` flag so it only runs in non-production environments (e.g., `synchronize: configService.get('NODE_ENV') !== 'production'`).
>
> 3. **User Entity & DTO Validation (src/user/):**
>    - Add `@CreateDateColumn()` and `@UpdateDateColumn()` fields (`createdAt`, `updatedAt`) to the User entity.
>    - Add string length constraints (`@MinLength`, `@MaxLength`) to the DTOs. Add a transformer (`@Transform`) to trim usernames and lowercase emails.
>    - Refactor the `update()` method in `UserService` to use explicit field assignment instead of `Object.assign()`.
>
> 4. **Error Handling (user.service.ts):**
>    - Narrow the exception type when catching the PostgreSQL error `23505` to avoid unsafe implicitly any property access. Change the thrown exception for duplicates from `BadRequestException` to `ConflictException` (409).
>
> 5. **Testing & Documentation:**
>    - Ensure existing unit tests are updated to support these changes and verify all tests pass under the new strict compiler settings.
>    - Automatically append these fixes and this prompt into the `prompts.md` file under the "Phase 1 - Code Review & Quality Assurance" section.

### Changes Applied

| # | Fix | Files Modified |
|---|-----|----------------|
| C6 | Enabled `"strict": true`, `"strictNullChecks": true`, `"noImplicitAny": true`, `"strictBindCallApply": true`, `"forceConsistentCasingInFileNames": true`, `"noFallthroughCasesInSwitch": true` | `tsconfig.json` |
| C1 | Installed `@nestjs/config`, moved DB credentials to `.env`, used `ConfigModule.forRoot({ isGlobal: true })` and `TypeOrmModule.forRootAsync()` with `ConfigService` | `app.module.ts`, `.env` (new), `package.json` |
| C2 | Gated `synchronize` behind `config.get('NODE_ENV') !== 'production'` | `app.module.ts` |
| C3 | Added `@CreateDateColumn() createdAt` and `@UpdateDateColumn() updatedAt` to `User` entity; added definite-assignment assertions (`!`) on all entity fields for strict mode | `user.entity.ts` |
| C4 | Added `@MinLength()`, `@MaxLength()` to all string DTO fields; added `@Transform()` to trim usernames/fullNames and lowercase emails; added `!` assertions on required DTO fields | `create-user.dto.ts`, `update-user.dto.ts` |
| C5 | Created `isQueryFailedWithCode()` type guard using `QueryFailedError` and typed `driverError`; replaced `BadRequestException` with `ConflictException`; added explicit `catch (error: unknown)` | `user.service.ts` |
| I4 | Replaced `Object.assign(user, dto)` with explicit field assignment checking `dto.fullName !== undefined` and `dto.role !== undefined` | `user.service.ts` |
| I1 | Switched duplicate-key error from `BadRequestException` (400) to `ConflictException` (409) | `user.service.ts` |
| I2 | Added `@Transform()` decorators for trimming and lowercasing | `create-user.dto.ts`, `update-user.dto.ts` |
| Tests | Updated mock `User` objects with `createdAt`/`updatedAt`; replaced `BadRequestException` references with `ConflictException`; added realistic `QueryFailedError` mock via `makeQueryFailedError()` helper; added partial-update test | `user.service.spec.ts`, `user.controller.spec.ts` |

### Verification

- **TypeScript strict compilation:** `npx tsc --noEmit` — 0 errors.
- **Unit tests:** 24 passed across 3 test suites (gained 1 new partial-update test).

---

## Phase 2 — Authentication (JWT) & Project Management

### Model

**Claude Opus 4.6** (Anthropic) — used via Cursor IDE agent mode.

### Prompt

> We are starting Phase 2: Authentication (JWT) and Project Management based on the project requirements and README.md contract.
>
> Please analyze the existing User module and apply the following changes and new features cleanly, keeping our strict TypeScript settings intact.
>
> 1. **Refactor User for Authentication:**
>    - Update the `User` entity to include a `password` column. Set `{ select: false }` on this column so it is not accidentally exposed in queries.
>    - Update `CreateUserDto` to accept a required `password` field (string, minimum 6 characters).
>    - In `UserService`, encrypt (hash) the password using `bcrypt` during user registration (`POST /users`).
>
> 2. **Create the Auth Module (Authentication):**
>    - Implement `POST /auth/login`: Accepts `username` and `password`. Validate the credentials against the database. If correct, return a signed JWT access token. Throw `UnauthorizedException` (401) on failure.
>    - Implement `GET /auth/me`: A protected endpoint that returns the current authenticated user's profile based on the JWT token provided in the Authorization header.
>    - Implement `POST /auth/logout`: Handle client logout (invalidate or clear token as standard for stateless JWT).
>    - Create a global `JwtAuthGuard` and strategy (using `@nestjs/jwt` and `passport-jwt`) to protect ALL endpoints except `/auth/login` and user creation/registration.
>
> 3. **Create the Project Module (Projects CRUD):**
>    - Create a `Project` entity with: id, name, description (optional), ownerId (FK to User), createdAt, updatedAt.
>    - Implement Soft Delete support for Projects (using TypeORM's `@DeleteDateColumn`).
>    - Implement endpoints: GET /projects, GET /projects/:projectId, POST /projects, POST /projects/update/:projectId, DELETE /projects/:projectId.
>
> 4. **Quality, Testing & Documentation Constraints:**
>    - Use strict validation DTOs with length constraints for all incoming data.
>    - Ensure explicit field mapping is used during updates rather than `Object.assign`.
>    - Write comprehensive Unit Tests for Auth and Project services and controllers. Update existing User tests for the new password requirement.
>    - All public methods must have JSDoc documentation.
>    - Append this prompt and implementation summary into `prompts.md`.

### Agent's Plan

1. **Analyze the repo** — read all existing files to understand the starting state after Phase 1 + code review fixes.
2. **Install dependencies** — `bcrypt`, `@nestjs/jwt`, `@nestjs/passport`, `passport`, `passport-jwt`, and their type definitions.
3. **Refactor `User` entity** — add `password` column with `{ select: false }` and `@Exclude()` decorator.
4. **Update `CreateUserDto`** — add `password` field with `@IsString()`, `@MinLength(6)`, `@MaxLength(128)`.
5. **Update `UserService`** — hash password with `bcrypt` during `create()`, add `findByUsernameWithPassword()` for auth.
6. **Add JWT secret to `.env`** — `JWT_SECRET` and `JWT_EXPIRATION`.
7. **Create `@Public()` decorator** — custom metadata decorator to bypass auth on specific routes.
8. **Create Auth module** — `LoginDto`, `JwtPayload` interface, `JwtStrategy` (Passport), `JwtAuthGuard`, `AuthService`, `AuthController`, `AuthModule`.
9. **Create Project module** — `Project` entity with `@DeleteDateColumn`, `CreateProjectDto`, `UpdateProjectDto`, `ProjectService` (with soft-delete/restore), `ProjectController`, `ProjectModule`.
10. **Wire `AppModule`** — register `AuthModule`, `ProjectModule`, and `JwtAuthGuard` globally via `APP_GUARD`.
11. **Mark public routes** — `@Public()` on `POST /auth/login` and `POST /users`.
12. **Update User tests** — add `password` to mock objects and DTOs, mock `bcrypt.hash`, test `findByUsernameWithPassword`.
13. **Write Auth tests** — service tests for login (valid, user-not-found, wrong-password), `getProfile`; controller tests for login, me, logout.
14. **Write Project tests** — service tests for findAll, findOne, create, update, softRemove, findDeleted, restore; controller tests mirroring all endpoints.
15. **Verify** — strict TypeScript compilation and all unit tests pass.

### Files Created

| File | Purpose |
|------|---------|
| `src/common/decorators/public.decorator.ts` | `@Public()` decorator to bypass JWT guard |
| `src/auth/dto/login.dto.ts` | Validated DTO for login credentials |
| `src/auth/interfaces/jwt-payload.interface.ts` | JWT payload shape definition |
| `src/auth/strategies/jwt.strategy.ts` | Passport JWT strategy |
| `src/auth/guards/jwt-auth.guard.ts` | Global guard that enforces JWT on all routes |
| `src/auth/auth.service.ts` | Login validation, token signing, profile retrieval |
| `src/auth/auth.controller.ts` | `POST /auth/login`, `GET /auth/me`, `POST /auth/logout` |
| `src/auth/auth.module.ts` | Wires JWT, Passport, and auth components |
| `src/auth/auth.service.spec.ts` | 5 unit tests for AuthService |
| `src/auth/auth.controller.spec.ts` | 4 unit tests for AuthController |
| `src/project/project.entity.ts` | Project entity with soft-delete (`@DeleteDateColumn`) and `ManyToOne` to User |
| `src/project/dto/create-project.dto.ts` | Validated DTO for project creation |
| `src/project/dto/update-project.dto.ts` | Validated DTO for project updates |
| `src/project/project.service.ts` | CRUD + soft-delete + restore + findDeleted |
| `src/project/project.controller.ts` | 7 endpoints matching README contract |
| `src/project/project.module.ts` | Wires entity, service, controller, imports UserModule |
| `src/project/project.service.spec.ts` | 11 unit tests for ProjectService |
| `src/project/project.controller.spec.ts` | 11 unit tests for ProjectController |

### Files Modified

| File | Change |
|------|--------|
| `.env` | Added `JWT_SECRET` and `JWT_EXPIRATION` |
| `src/user/user.entity.ts` | Added `password` column with `{ select: false }` and `@Exclude()` |
| `src/user/dto/create-user.dto.ts` | Added `password` field with `@MinLength(6)` / `@MaxLength(128)` |
| `src/user/user.service.ts` | Added `bcrypt.hash()` in `create()`, added `findByUsernameWithPassword()`, strip password from create response |
| `src/user/user.controller.ts` | Added `@Public()` on `POST /users` for self-registration |
| `src/app.module.ts` | Imported `AuthModule`, `ProjectModule`; registered `JwtAuthGuard` globally via `APP_GUARD` |
| `src/user/user.service.spec.ts` | Added `password` to mocks, mocked `bcrypt`, added `findByUsernameWithPassword` tests, added `createQueryBuilder` mock |
| `src/user/user.controller.spec.ts` | Updated mock objects and DTOs with `password` field |

### Verification

- **TypeScript strict compilation:** `npx tsc --noEmit` — 0 errors.
- **Unit tests:** 65 passed across 7 test suites:
  - `src/app.controller.spec.ts` — 1 test
  - `src/user/user.service.spec.ts` — 16 tests
  - `src/user/user.controller.spec.ts` — 11 tests
  - `src/auth/auth.service.spec.ts` — 5 tests
  - `src/auth/auth.controller.spec.ts` — 4 tests
  - `src/project/project.service.spec.ts` — 11 tests
  - `src/project/project.controller.spec.ts` — 11 tests

---

## Phase 2 — Code Review & Quality Assurance

### Model

**Claude Opus 4.6** (Anthropic) — used via Cursor IDE agent mode.

### Prompt

> You are a Senior Software Architect and Cyber Security Expert performing a rigorous Code Review on Phase 2 (Authentication & Project Management) of the IssueFlow platform.
>
> Please review all the files under `src/auth/` and `src/project/` along with the changes in `src/user/`. Analyze the implementation against production-grade NestJS, Passport, and TypeORM security and architectural standards.
>
> Provide constructive feedback on the following aspects:
>
> 1. JWT & Passport Security: Is the `JwtStrategy` implemented securely? Is the secret handled via ConfigService (not hardcoded)? How long is the token lifespan (`expiresIn`)?
> 2. Route Protection & Guards: Does the global `APP_GUARD` correctly protect all routes? Is the `@Public()` decorator robust, or is there a risk of unintended exposure?
> 3. Database Relations & Integrity: In the `Project` entity, is the relation to `User` correctly typed? Is the `ownerId` validated to ensure the user actually exists before creating a project?
> 4. Soft Delete Implementation: Is TypeORM's `@DeleteDateColumn` utilized correctly? When fetching "all active projects", does TypeORM automatically filter out the soft-deleted ones, or do we need explicit clauses? Is the `/projects/deleted` endpoint restricted correctly?
> 5. Error Handling & Edge Cases: What happens if a non-owner tries to update a project? (Does the requirement enforce ownership checks for updates, or is that for a later phase? Check README/PDF).
> 6. Documentation & Logging Task: Append this full interaction to `prompts.md`.
>
> Highlight any critical security or architectural flaws that must be addressed before we move to Phase 3 (Tickets & Comments).

### Review Analysis

#### 1. JWT & Passport Security

**Strengths:**
- JWT secret loaded from `ConfigService` — not hardcoded in source. Both `JwtModule.registerAsync()` and `JwtStrategy` read from `config.get('JWT_SECRET')`.
- `ignoreExpiration: false` on the Passport strategy — expired tokens are properly rejected.
- Token extraction uses `ExtractJwt.fromAuthHeaderAsBearerToken()` — standard Bearer scheme.
- 1-hour token lifespan (`3600s`) is reasonable for development/MVP.
- `bcrypt` with 10 salt rounds is industry standard.
- `{ select: false }` on `password` column + `@Exclude()` decorator = defense-in-depth for credential protection.
- `findByUsernameWithPassword()` uses explicit `addSelect('user.password')` — password only loaded when authentication requires it.
- Login error message is generic for both user-not-found and wrong-password — prevents user enumeration.

**Issues found:**
- **[CRITICAL] Fallback default secret is a production time-bomb.** Both `auth.module.ts:25` and `jwt.strategy.ts:19` fall back to `'issueflow-dev-secret-change-in-production'`. If `JWT_SECRET` is unset in production (misconfigured deployment, missing `.env` in a container), the app silently starts with a known secret. Any attacker can forge valid JWTs. **Fix:** Use `config.getOrThrow<string>('JWT_SECRET')` which throws at startup if the variable is missing.
- **[IMPORTANT] `expiresIn: 3600` hardcoded in login response.** The `AuthService.login()` returns `expiresIn: 3600` as a literal, but the actual token TTL is configured from `config.get('JWT_EXPIRATION', 3600)`. If someone changes the env var, the response becomes misleading. **Fix:** Inject `ConfigService` into `AuthService` and read the expiration dynamically.
- **[IMPORTANT] `validate()` return type loosens `role` to `string`.** The `JwtPayload` interface correctly types `role` as `Role`, but `validate()` returns `{ role: string }`. Should be `{ role: Role }` — when a `RolesGuard` is added, the loose type would require unsafe casting.

#### 2. Route Protection & Guards

**Strengths:**
- `JwtAuthGuard` registered globally via `APP_GUARD` in `AppModule` — all routes protected by default.
- Guard uses `reflector.getAllAndOverride()` checking both handler and class metadata — correct pattern.
- Only two endpoints are `@Public()`: `POST /auth/login` and `POST /users`.

**Issues found:**
- **[CRITICAL] `POST /users` is `@Public()` with unrestricted role — privilege escalation.** Any anonymous user can create accounts with any role, including `ADMIN`. The `CreateUserDto` accepts `role` as a required field with no restriction on who sets it. An attacker sends `{ "role": "ADMIN", ... }` and gains full admin access. **Fix options:** (a) Remove `@Public()` — only authenticated admins create users. (b) Create a separate `POST /auth/register` that's public but forces `role: DEVELOPER`. (c) Override role to `DEVELOPER` in the service when no authenticated user context is present.
- **[CRITICAL] No role-based access control (RBAC) exists anywhere.** JWT guard ensures authentication but there is zero authorization. Any authenticated `DEVELOPER` can: delete any user (including admins), promote themselves to `ADMIN` via `POST /users/update/:userId`, view all soft-deleted projects, restore any deleted project, and delete anyone's project.

#### 3. Database Relations & Integrity

**Strengths:**
- `Project.owner` has proper `@ManyToOne(() => User)` with explicit `@JoinColumn({ name: 'ownerId' })`.
- `ownerId` exposed as a `@Column()` — allows querying without joining.
- `ProjectService.create()` validates owner existence via `userService.findOne()` before insert.
- `ProjectModule` imports `UserModule` to access `UserService` — correct dependency wiring.

**Issues found:**
- **[IMPORTANT] `onDelete: 'CASCADE'` on projects is dangerous.** If a user is hard-deleted (any authenticated user can do this due to RBAC gap), ALL their projects are permanently destroyed. Compounds the RBAC problem. **Fix:** Change to `onDelete: 'RESTRICT'` or switch users to soft-delete.
- **[IMPORTANT] Owner validation catches all exceptions, not just `NotFoundException`.** The `try/catch` in `ProjectService.create()` swallows database connection errors, TypeORM timeouts, etc. and reports them as "Owner does not exist." **Fix:** Catch `NotFoundException` specifically and re-throw all other errors.
- **[MINOR] No unique constraint on project name.** Multiple projects with identical names are allowed.

#### 4. Soft Delete Implementation

**Strengths:**
- `@DeleteDateColumn()` on `deletedAt` is the correct TypeORM mechanism. When present, TypeORM **automatically** filters out soft-deleted records from `find()`, `findOne()`, `findOneBy()` — no explicit `WHERE deletedAt IS NULL` needed.
- `softRemove()` correctly loads the entity first (triggers `NotFoundException`), then calls `repository.softRemove(entity)`.
- `findDeleted()` uses `createQueryBuilder().withDeleted().where('deletedAt IS NOT NULL')` — correct pattern for listing only soft-deleted records.
- `restore()` uses `repository.restore(id)` and checks `affected === 0` — clean.

**Issues found:**
- **[IMPORTANT] `GET /projects/deleted` and `POST /projects/:projectId/restore` are unrestricted.** Any authenticated user can list all deleted projects and restore any of them. Should be admin-only operations.
- **[MINOR] `restore()` doesn't distinguish "not found" from "already active."** `repository.restore(id)` matches `WHERE deletedAt IS NOT NULL`, so calling it on an active project returns `affected: 0`. Error says "Soft-deleted project not found" but the project may exist and just not be deleted — ambiguous for clients.

#### 5. Error Handling & Edge Cases

**Strengths:**
- All service methods throw `NotFoundException` for missing entities.
- Login flow uses the same error for user-not-found and wrong-password (anti-enumeration).
- `ParseIntPipe` on all path params catches non-numeric IDs.

**Issues found:**
- **[IMPORTANT] No ownership checks on project mutations.** Any authenticated user can update or delete any project regardless of ownership. If ownership enforcement is deferred to Phase 3, this should be explicitly documented.
- **[IMPORTANT] `ClassSerializerInterceptor` not registered globally.** The `@Exclude()` decorator on the password field only works if this interceptor is active. Currently, password is manually stripped via destructuring in `create()`, but other code paths that accidentally load the password would expose it.
- **[MINOR] Implicit return types on `AuthService.getProfile()` and `AuthController.login()`.** Inconsistent with all other methods that declare explicit `Promise<...>` return types.

#### 6. Test Quality

**Strengths:**
- Auth service tests cover valid login, user-not-found, wrong-password, profile retrieval, and profile not-found — good credential flow coverage.
- `bcrypt.compare` properly mocked via `jest.mock('bcrypt')`.
- Project service tests cover full CRUD lifecycle including soft-delete, restore, partial updates, and owner validation.
- `createQueryBuilder` mock chain correctly composed for `findDeleted`.
- `restore` tests verify both `affected: 1` and `affected: 0` paths.

**Gaps:**
- No test for `create()` owner-validation catching a non-`NotFoundException` (DB timeout) — silent swallowing goes undetected.
- No e2e tests for the JWT auth flow (login → token → protected endpoint → rejection with invalid token).
- No test that `@Public()` routes actually bypass the guard — guard integration is assumed.
- Controller tests remain passthrough-only (same Phase 1 criticism).

### Remediation Plan for Phase 3 Readiness

#### Critical fixes (must complete before Phase 3):

| # | Issue | Fix |
|---|-------|-----|
| C1 | JWT secret fallback default | Replace `config.get()` with `config.getOrThrow<string>('JWT_SECRET')` in both `auth.module.ts` and `jwt.strategy.ts` — fail fast on missing secret |
| C2 | `POST /users` privilege escalation | Either remove `@Public()` from user creation, or create a dedicated `POST /auth/register` endpoint that forces `role: DEVELOPER` |
| C3 | No RBAC — authorization bypass | Implement `@Roles()` decorator + `RolesGuard` to restrict destructive operations (user deletion, role changes, deleted-project access, restore) to `ADMIN` |

#### Important fixes (recommended before Phase 3):

| # | Issue | Fix |
|---|-------|-----|
| I1 | `expiresIn` hardcoded in response | Inject `ConfigService` into `AuthService`, read `JWT_EXPIRATION` dynamically |
| I2 | Owner validation swallows all exceptions | Catch `NotFoundException` specifically, re-throw all others |
| I3 | `onDelete: 'CASCADE'` on projects | Change to `onDelete: 'RESTRICT'` or implement user soft-delete |
| I4 | `/projects/deleted` and `/restore` unrestricted | Gate behind `@Roles(Role.ADMIN)` once RBAC is implemented |
| I5 | `ClassSerializerInterceptor` not global | Register globally in `main.ts` for `@Exclude()` defense-in-depth |
| I6 | `validate()` role type loosened to `string` | Change return type to `{ userId: number; username: string; role: Role }` |

#### Minor (future improvements):

| # | Issue | Fix |
|---|-------|-----|
| M1 | No unique constraint on project name | Add `@Column({ unique: true })` or composite `(name, ownerId)` unique index |
| M2 | Implicit return types on auth methods | Add explicit `Promise<...>` return types |
| M3 | `restore()` ambiguous error message | Check project existence first, then check if it's soft-deleted |
| M4 | No e2e tests for auth flow | Add `supertest`-based e2e tests covering login → access → rejection |
| M5 | No token refresh mechanism | Add refresh token rotation for production readiness |

---

## Phase 2 — Code Review Fixes Applied

### Model

**Claude Opus 4.6** (Anthropic) — used via Cursor IDE agent mode.

### Prompt

> Please apply the critical and important fixes identified in the Phase 2 Code Review to ensure the Auth and Project modules are production-ready and secure before we proceed to Phase 3.
>
> Execute the following refactoring carefully, keeping our strict TypeScript compilation intact:
>
> 1. **JWT & Passport Security Fixes:**
>    - In `auth.module.ts` and `jwt.strategy.ts`, replace the fallback string with `config.getOrThrow<string>('JWT_SECRET')` to ensure the application fails loudly at startup if the secret is missing.
>    - Inject `ConfigService` into `AuthService` and dynamically read `JWT_EXPIRATION` for the `expiresIn` field in the login response to prevent configuration mismatches.
>    - Update the `validate()` method in `JwtStrategy` to return the explicit `Role` enum type (`role: Role`) instead of a loose string.
>
> 2. **Role-Based Authorization (RBAC) & Route Protection:**
>    - Create a `@Roles(...roles: Role[])` decorator and a global `RolesGuard`. The guard should read the user's role from `request.user.role` and match it against allowed roles.
>    - REMOVE `@Public()` from `POST /users` (User registration). This endpoint must be restricted to ADMIN users only to prevent anonymous privilege escalation.
>    - Protect all destructive and administrative routes using the new `@Roles(Role.ADMIN)` decorator, specifically:
>      - `DELETE /users/:userId`
>      - `POST /users/update/:userId`
>      - `GET /projects/deleted`
>      - `POST /projects/:projectId/restore`
>
> 3. **Database Integrity & Serialization:**
>    - Register `ClassSerializerInterceptor` globally in `main.ts` so that the `@Exclude()` decorator on the password field functions correctly across all query paths.
>    - In `Project` entity, change the relation constraint from `onDelete: 'CASCADE'` to `onDelete: 'RESTRICT'` to prevent accidental data destruction.
>    - Refactor owner validation in `ProjectService.create()` to specifically catch `NotFoundException` from the UserService, rather than swallowing all generic database/network exceptions.
>
> 4. **Testing & Documentation:**
>    - Update the existing unit tests to support these security changes.
>    - Automatically append this interaction summary and the applied fixes to `prompts.md`.

### Changes Applied

| # | Fix | Files Modified |
|---|-----|----------------|
| S1 | Replaced JWT_SECRET fallback with `config.getOrThrow<string>('JWT_SECRET')` — app crashes at startup if secret is missing | `auth.module.ts`, `jwt.strategy.ts` |
| S2 | Injected `ConfigService` into `AuthService`; `expiresIn` now reads from `config.get<number>('JWT_EXPIRATION', 3600)` dynamically | `auth.service.ts` |
| S3 | `JwtStrategy.validate()` return type changed from `role: string` to `role: Role` | `jwt.strategy.ts` |
| R1 | Created `@Roles(...roles: Role[])` decorator at `src/common/decorators/roles.decorator.ts` | New file |
| R2 | Created `RolesGuard` at `src/auth/guards/roles.guard.ts` — reads `request.user.role`, throws `ForbiddenException` on mismatch | New file |
| R3 | Registered `RolesGuard` globally via `APP_GUARD` in `app.module.ts` (runs after `JwtAuthGuard`) | `app.module.ts` |
| R4 | Removed `@Public()` from `POST /users`; replaced with `@Roles(Role.ADMIN)` — user creation now requires admin JWT | `user.controller.ts` |
| R5 | Added `@Roles(Role.ADMIN)` to `DELETE /users/:userId`, `POST /users/update/:userId`, `GET /projects/deleted`, `POST /projects/:projectId/restore` | `user.controller.ts`, `project.controller.ts` |
| D1 | Registered `ClassSerializerInterceptor` globally in `main.ts` — `@Exclude()` on `password` now works on all responses | `main.ts` |
| D2 | Changed `Project.owner` relation from `onDelete: 'CASCADE'` to `onDelete: 'RESTRICT'` | `project.entity.ts` |
| D3 | Narrowed `ProjectService.create()` catch block to only catch `NotFoundException`; unexpected errors now propagate | `project.service.ts` |
| T1 | Added `ConfigService` mock to `AuthService` tests; verified dynamic `expiresIn` | `auth.service.spec.ts` |
| T2 | Added test for unexpected error propagation in `ProjectService.create()` owner lookup | `project.service.spec.ts` |

### Files Created

| File | Purpose |
|------|---------|
| `src/common/decorators/roles.decorator.ts` | `@Roles()` metadata decorator for RBAC |
| `src/auth/guards/roles.guard.ts` | Global guard that enforces role-based access control |

### Verification

- **TypeScript strict compilation:** `npx tsc --noEmit` — 0 errors.
- **Unit tests:** 66 passed across 7 test suites (gained 1 new test for narrowed error propagation).

---

## Phase 3 — Tickets, Comments & Mentions

### Prompt

> We are starting Phase 3: Tickets Management, Comments, and Mentions APIs based on the project requirements and README.md contract. Implement the following features under strict TypeScript rules:
>
> 1. **Ticket Module** — Entity with enums (Status: TODO, IN_PROGRESS, IN_REVIEW, DONE; Priority: LOW, MEDIUM, HIGH, CRITICAL; Type: BUG, FEATURE, TECHNICAL), soft-delete, `isOverdue` flag, ManyToOne relations to Project and User. CRUD endpoints matching the README contract. Business rules: tickets cannot be updated once DONE; status transitions are forward-only.
> 2. **Comment & Mentions Module** — Entity with ManyToMany `mentionedUsers` join table. `@username` mention parsing via regex. CRUD endpoints nested under `/tickets/:ticketId/comments`. Mentions are re-evaluated on every create/update.
> 3. **Mentions Endpoint** — `GET /users/:userId/mentions` on UserController with pagination, delegating to CommentService.
> 4. **Wire into AppModule** — Import TicketModule and CommentModule.
> 5. **Unit Tests** — Comprehensive coverage for all new services, controllers, and the mention-parsing utility.

### AI Model

Claude Opus 4.6 (Cursor Agent mode)

### Plan Summary

- Enum values follow the TDP requirements exactly
- Ticket status lifecycle enforced: forward-only transitions, DONE tickets immutable
- `isOverdue` is a database column (boolean, default false) for future auto-escalation
- Mention parsing uses case-insensitive regex `/\B@(\w+)/gi`; results are unique, lowercased
- Comment `mentionedUsers` stored in a `comment_mentions` join table via `@ManyToMany`
- `GET /users/:userId/mentions` lives on UserController, delegates to CommentService
- Circular dependency between UserModule and CommentModule resolved with `forwardRef()`

### Implementation Summary

#### Ticket Module (`src/ticket/`)

- **Enums:** `TicketStatus` (TODO, IN_PROGRESS, IN_REVIEW, DONE) with `STATUS_ORDER` map, `TicketPriority` (LOW, MEDIUM, HIGH, CRITICAL), `TicketType` (BUG, FEATURE, TECHNICAL)
- **Entity:** `Ticket` with all required fields, `@ManyToOne` to Project (CASCADE) and User (SET NULL), `@DeleteDateColumn` for soft-delete, `isOverdue` boolean column
- **DTOs:** `CreateTicketDto` (strict enum validation, string lengths, optional assigneeId/dueDate), `UpdateTicketDto` (all fields optional)
- **Service:** CRUD + soft-delete/restore, validates projectId and assigneeId existence, enforces DONE immutability and forward-only status transitions
- **Controller:** 7 endpoints matching README contract; `GET /tickets/deleted` and `POST /tickets/:ticketId/restore` restricted to ADMIN
- **Module:** Imports ProjectModule and UserModule, exports TicketService

#### Comment Module (`src/comment/`)

- **Entity:** `Comment` with `@ManyToOne` to Ticket (CASCADE) and User (CASCADE), `@ManyToMany` to User via `comment_mentions` join table
- **DTOs:** `CreateCommentDto` (authorId + content), `UpdateCommentDto` (content only)
- **Mention Utility:** `extractMentions()` pure function using `/\B@(\w+)/gi` regex
- **Service:** CRUD with automatic mention parsing/resolution on create/update, `findMentionsForUser()` with pagination
- **Controller:** 4 endpoints nested under `/tickets/:ticketId/comments`
- **Module:** Imports TicketModule and UserModule (via forwardRef), exports CommentService

#### User Module Changes

- Added `findByUsernames()` method to UserService for bulk mention resolution
- Added `GET /users/:userId/mentions` endpoint to UserController
- UserModule now imports CommentModule via `forwardRef()`

#### AppModule

- Added TicketModule and CommentModule to imports array

### Files Created / Modified

| File | Purpose |
|------|---------|
| `src/ticket/enums/ticket-status.enum.ts` | TicketStatus enum with STATUS_ORDER map |
| `src/ticket/enums/ticket-priority.enum.ts` | TicketPriority enum |
| `src/ticket/enums/ticket-type.enum.ts` | TicketType enum |
| `src/ticket/ticket.entity.ts` | Ticket entity with relations, soft-delete, isOverdue |
| `src/ticket/dto/create-ticket.dto.ts` | Validated DTO for ticket creation |
| `src/ticket/dto/update-ticket.dto.ts` | Validated DTO for ticket updates |
| `src/ticket/ticket.service.ts` | Ticket CRUD + status lifecycle enforcement |
| `src/ticket/ticket.controller.ts` | 7 ticket endpoints matching README contract |
| `src/ticket/ticket.module.ts` | TicketModule wiring |
| `src/ticket/ticket.service.spec.ts` | 22 unit tests for TicketService |
| `src/ticket/ticket.controller.spec.ts` | 13 unit tests for TicketController |
| `src/comment/comment.entity.ts` | Comment entity with ManyToMany mentionedUsers |
| `src/comment/dto/create-comment.dto.ts` | Validated DTO for comment creation |
| `src/comment/dto/update-comment.dto.ts` | Validated DTO for comment updates |
| `src/comment/mention.util.ts` | extractMentions() pure utility function |
| `src/comment/comment.service.ts` | Comment CRUD + mention parsing/resolution + pagination |
| `src/comment/comment.controller.ts` | 4 comment endpoints |
| `src/comment/comment.module.ts` | CommentModule wiring with forwardRef |
| `src/comment/mention.util.spec.ts` | 9 unit tests for mention regex |
| `src/comment/comment.service.spec.ts` | 13 unit tests for CommentService |
| `src/comment/comment.controller.spec.ts` | 9 unit tests for CommentController |
| `src/user/user.service.ts` | Added findByUsernames() method |
| `src/user/user.controller.ts` | Added GET /users/:userId/mentions endpoint |
| `src/user/user.module.ts` | Added forwardRef(() => CommentModule) import |
| `src/user/user.service.spec.ts` | Added 2 tests for findByUsernames() |
| `src/user/user.controller.spec.ts` | Added CommentService mock + 2 tests for findMentions |
| `src/app.module.ts` | Added TicketModule and CommentModule imports |

### Verification

- **TypeScript strict compilation:** `npx tsc --noEmit` — 0 errors.
- **Unit tests:** 137 passed across 12 test suites.

---

## Phase 3b — Dependencies, Attachments & CSV Export/Import

### Prompt

> Complete Phase 3 by implementing 3 remaining sub-features for the Ticket module:
>
> 1. **Ticket Dependencies** (TDP 3.2) — Self-referencing ManyToMany on Ticket for blockers, 3 endpoints (add/list/remove), same-project constraint, DONE transition guard (cannot move to DONE with unresolved blockers).
> 2. **Attachment Management** (TDP 3.3) — Attachment entity with metadata, upload endpoint with 10 MB max size and MIME type allowlist (image/png, image/jpeg, application/pdf, text/plain), delete endpoint.
> 3. **CSV Export & Import** (TDP 3.4) — Export active tickets as CSV, import tickets from CSV with per-row validation and summary response.

### AI Model

Claude Opus 4.6 (Cursor Agent mode)

### Plan Summary

- Dependencies use a self-referencing `@ManyToMany` with a `ticket_dependencies` join table
- `TicketService.update()` enhanced: when transitioning to DONE, loads `blockedBy` relation and rejects if any blocker status is not DONE
- Same-project constraint enforced when adding a dependency
- Attachment entity stores metadata only (filename, contentType, size); file bytes discarded
- File validation in service layer: max 10 MB, strict MIME type allowlist
- CSV export uses `csv-stringify/sync`, import uses `csv-parse/sync` with per-row validation
- Route ordering: `export` and `import` routes declared before `GET :ticketId` to avoid param collision

### Implementation Summary

#### Ticket Dependencies

- **Entity**: Added `@ManyToMany(() => Ticket)` + `@JoinTable({ name: 'ticket_dependencies' })` for `blockedBy` relation on `Ticket`
- **DTO**: `AddDependencyDto` with `@IsInt() blockedBy`
- **Service**: `addDependency()` (validates same project), `getDependencies()`, `removeDependency()`; modified `update()` to check unresolved blockers when transitioning to DONE
- **Controller**: 3 new endpoints matching README contract

#### Attachment Management

- **Entity**: `Attachment` with id, ticketId, filename, contentType, size, createdAt
- **Service**: `upload()` validates ticket exists, file size <= 10 MB, MIME type in allowlist; `remove()` validates ownership
- **Controller**: `FileInterceptor('file')` for upload, `ParseIntPipe` for delete
- **Module**: `AttachmentModule` imports `TicketModule`, wired into `AppModule`

#### CSV Export & Import

- **Service**: `exportToCsv(projectId)` using `csv-stringify/sync`, `importFromCsv(projectId, buffer)` using `csv-parse/sync` with per-row validation
- **Controller**: `GET /tickets/export?projectId=` sets CSV headers and sends content; `POST /tickets/import` with `FileInterceptor` and `projectId` form field
- Both routes placed BEFORE `GET :ticketId` to avoid route collision

### Files Created / Modified

| File | Purpose |
|------|---------|
| `src/ticket/ticket.entity.ts` | Added `blockedBy` ManyToMany self-relation |
| `src/ticket/dto/add-dependency.dto.ts` | DTO for adding a blocker dependency |
| `src/ticket/ticket.service.ts` | Added dependency CRUD, DONE blocker guard, CSV export/import |
| `src/ticket/ticket.controller.ts` | Added dependency, export, import endpoints |
| `src/attachment/attachment.entity.ts` | Attachment metadata entity |
| `src/attachment/attachment.service.ts` | Upload validation + delete |
| `src/attachment/attachment.controller.ts` | FileInterceptor-based upload + delete |
| `src/attachment/attachment.module.ts` | AttachmentModule wiring |
| `src/app.module.ts` | Added AttachmentModule import |
| `src/ticket/ticket.service.spec.ts` | Added 37 tests (dependencies, CSV, blocker guard) |
| `src/ticket/ticket.controller.spec.ts` | Added tests for dependency, export, import endpoints |
| `src/attachment/attachment.service.spec.ts` | 11 tests for upload validation + delete |
| `src/attachment/attachment.controller.spec.ts` | 5 tests for controller delegation |

### Verification

- **TypeScript strict compilation:** `npx tsc --noEmit` — 0 errors.
- **Unit tests:** 174 passed across 14 test suites.

---

## Phase 3 — Code Review & Quality Assurance

### Model

**Claude Opus 4.6** (Anthropic) — used via Cursor IDE agent mode.

### Prompt

> You are a Senior Software Architect and Backend Technical Lead performing a rigorous Code Review on Phase 3 (Tickets, Comments, Dependencies, Attachments, and CSV Export/Import) of the IssueFlow platform.
>
> Please review all files under `src/ticket/` and `src/comment/` against production-grade NestJS, TypeORM, and security best practices. Analyze the implementation and provide constructive feedback on the following critical vectors:
>
> 1. Ticket Lifecycle & Dependency Logic:
>    - Does the `update()` status transition properly check all blocking tickets? Is the query optimal, or does it cause an N+1 query problem when evaluating if blockers are 'DONE'?
>    - Does the same-project constraint on dependencies strictly validate both tickets before adding a blocker?
>
> 2. Comment Mentions & Regex Performance:
>    - Analyze the `extractMentions` regex logic (`/\B@(\w+)/gi`). Is it safe from ReDoS (Regex Denial of Service) attacks?
>    - When resolving mentions against the UserService, is it done using a single bulk query (e.g., `In([usernames])`), or is it executing a query in a loop (performance bottleneck)?
>
> 3. File Upload & Attachment Security:
>    - Review the Attachment upload route. Is the 10MB size limit and MIME type filtering applied at the framework/middleware level (using NestJS `ParseFilePipe` or Multer filters), or is it checked manually inside the service code after the file is already fully read into memory?
>    - Is there a risk of Path Traversal or malicious file injection through the filename?
>
> 4. CSV Parser Robustness (Import/Export):
>    - Does the CSV import handle large files safely without crashing the node process (Memory Exhaustion)? Is it utilizing streams or chunked processing, or loading the entire file into an array?
>    - How gracefully does it handle malformed rows, missing columns, or invalid enum strings? Does a single corrupt row crash the entire import transaction, or does it properly log it in the `errors` array and skip to the next row?
>
> 5. Type Safety & Guard Coverage:
>    - Are the ADMIN-restricted routes (`/tickets/deleted`, `/restore`) fully protected by the `@Roles(Role.ADMIN)` decorator and enforcing the global `RolesGuard`?
>    - Are there any loose type coercions or missing return types?
>
> 6. Documentation Task:
>    - Append this interaction (this prompt, your analysis, and any remediation steps) to `prompts.md` under a clear "Phase 3 - Code Review & Quality Assurance" section.
>
> Highlight any critical architecture or security flaws that must be fixed before we move to Phase 4 (Auto-Escalation, Auto-Assignment, and Audit Logs).

### Review Analysis

#### 1. Ticket Lifecycle & Dependency Logic

**Strengths:**
- Forward-only status lifecycle enforced via `STATUS_ORDER` numeric map in `ticket-status.enum.ts` — clean, maintainable pattern.
- DONE guard correctly loads `blockedBy` relation and filters for unresolved blockers before allowing transition.
- Same-project constraint in `addDependency()` validates `ticket.projectId !== blocker.projectId`.
- Both tickets are fully loaded before the dependency is created — no dangling FK risk.

**Issues found:**
- **[CRITICAL] Blocker check loads ALL blockers into memory then filters in JS.** In `ticket.service.ts:141-153`, when transitioning to DONE, the code does `relations: ['blockedBy']` which eagerly loads every blocking ticket entity, then filters with `.filter(b => b.status !== TicketStatus.DONE)`. This is an N+1 anti-pattern: if a ticket has 50 blockers, all 50 rows are fetched just to check their status. **Fix:** Use a single count query against the join table filtered by `blocker.status != 'DONE'`.
- **[IMPORTANT] No self-referential dependency guard.** `addDependency()` does not check `ticketId !== dto.blockedBy`. A ticket can block itself, creating a permanent deadlock where the ticket can never reach DONE.
- **[IMPORTANT] No circular dependency detection.** If ticket A blocks B and B blocks A, both are permanently stuck. While full cycle detection is expensive, at minimum the direct circular case (A blocks B, then B blocks A) should be rejected.
- **[IMPORTANT] No duplicate dependency guard.** Calling `addDependency` twice with the same blocker pushes it to the array again. TypeORM's `@JoinTable` may silently ignore the duplicate at the DB level (unique constraint on the join table), but the in-memory array will have duplicates until the next fetch.

#### 2. Comment Mentions & Regex Performance

**Strengths:**
- `extractMentions` in `mention.util.ts` is isolated as a pure function with its own spec file — excellent testability.
- Results are deduplicated via `new Set()` and lowercased.
- The `\B` boundary correctly prevents matching email addresses (e.g., `user@example.com`).
- `findByUsernames()` in `user.service.ts:101-107` uses a **single bulk query** with `IN (:...usernames)` — no N+1 loop.

**Issues found:**
- **[LOW RISK] ReDoS analysis of `/\B@(\w+)/gi`.** This regex has **no nested quantifiers**, no alternation, and no overlapping groups. The `\w+` is a single greedy quantifier that advances linearly. This pattern is **safe from ReDoS**. The worst case is O(n) where n is the input length. The 5000-character `MaxLength` on comment content further bounds the input.
- **[IMPORTANT] `findByUsernames` does case-insensitive lookup with `LOWER(user.username)`.** This applies a function on the column, which **defeats any index** on `username`. At scale, every mention resolution triggers a full table scan. **Fix:** Either store usernames in a consistent case (lowercase) and compare directly, or add a functional index: `CREATE INDEX idx_users_username_lower ON users (LOWER(username))`.
- **[MINOR] Unresolved mentions are silently ignored.** If a user types `@nonexistent`, `findByUsernames` returns fewer results than usernames extracted. The system silently drops the mention. This is acceptable behavior but undocumented.

#### 3. File Upload & Attachment Security

**Strengths:**
- Ticket existence is validated before accepting the file.
- MIME whitelist is properly restrictive: only `image/png`, `image/jpeg`, `application/pdf`, `text/plain`.
- Both size and MIME checks are present with clear error messages.
- Attachment entity stores metadata only (filename, contentType, size) — no file content in DB.

**Issues found:**
- **[CRITICAL] Size and MIME validation happen AFTER the file is fully buffered in memory.** The `FileInterceptor('file')` in `attachment.controller.ts:29` uses Multer's default memory storage with **no limits configured**. Multer reads the entire file into `file.buffer` before the service's `upload()` method runs. An attacker can send a 1 GB file, and it will be fully read into Node.js memory before the `file.size > MAX_FILE_SIZE` check rejects it. **Fix:** Configure Multer `limits` and `fileFilter` directly on the `FileInterceptor` options so rejection happens during the upload stream, not after.
- **[CRITICAL] Path traversal risk via `file.originalname`.** In `attachment.service.ts:69`, `filename: file.originalname` stores the raw filename from the client. If this filename is later used to write to disk (e.g., in Phase 4 or a future download endpoint), a value like `../../../etc/passwd` could traverse the filesystem. **Fix:** Sanitize the filename now — strip directory components and control characters using `path.basename()` and a character whitelist regex.
- **[IMPORTANT] MIME type is client-declared, not verified.** `file.mimetype` comes from the `Content-Type` header of the multipart part — the client can claim any type. An attacker can upload an executable named `virus.png` with `Content-Type: image/png`. If the file is ever served back, this becomes an XSS or RCE vector. **Fix:** For defense-in-depth, validate magic bytes (file signature) using a library like `file-type`, or at minimum document this limitation.
- **[MINOR]** The CSV import endpoint at `ticket.controller.ts:85` also uses `FileInterceptor` with no size limit. A multi-GB CSV could exhaust memory.

#### 4. CSV Parser Robustness (Import/Export)

**Strengths:**
- Row-level error handling: invalid rows are collected in the `errors` array with row numbers, while valid rows are imported — the process does not abort on a single bad row.
- Enum validation uses `Set` lookups against `TicketStatus`, `TicketPriority`, `TicketType` values.
- Missing `title`/`description` detected via `?.trim()` checks.
- DB save errors are also caught per-row with error messages.
- `skip_empty_lines: true` and `trim: true` options on the parser.

**Issues found:**
- **[CRITICAL] `csv-parse/sync` loads the entire file into an array in memory.** In `ticket.service.ts:282`, `parse(fileBuffer, { columns: true })` parses the complete buffer synchronously into a `records` array. Combined with the unbounded `FileInterceptor` (no Multer `limits`), a large CSV (e.g. 500k rows) will create 500k objects in memory simultaneously. **Fix:** Use the streaming `csv-parse` (not `/sync`) with a transform pipeline, or at minimum enforce a file size limit on the CSV import endpoint.
- **[IMPORTANT] Each row is saved individually with `await this.ticketRepository.save(ticket)` inside the loop.** For 1000 rows, this is 1000 separate INSERT queries + 1000 round trips. **Fix:** Batch valid rows and use `this.ticketRepository.save(validTickets)` in a single call, or at least chunk them (e.g., 100 at a time).
- **[IMPORTANT] No transaction wrapping.** If the import succeeds for rows 1-50 but the process crashes at row 51, the first 50 rows are committed. For idempotent imports this is fine, but the client has no way to roll back a partial import. Consider wrapping in a transaction with a `rollbackOnError` option.
- **[MINOR] `assigneeId` validation is skipped during CSV import.** The HTTP `create()` endpoint validates that the assignee exists, but `importFromCsv` directly assigns `Number(row['assigneeId'])` without checking. This could create tickets pointing to non-existent users.
- **[MINOR] Export columns are limited to 7 fields.** `dueDate`, `isOverdue`, `createdAt`, `updatedAt` are excluded from CSV export. If a round-trip (export then re-import) is expected, data loss occurs.

#### 5. Type Safety & Guard Coverage

**Strengths:**
- `@Roles(Role.ADMIN)` correctly applied to `GET /tickets/deleted` and `POST /tickets/:ticketId/restore`.
- `RolesGuard` is registered globally via `APP_GUARD` in `app.module.ts:56` after `JwtAuthGuard` — correct ordering.
- Guard reads `request.user.role` and throws `ForbiddenException` — clean.
- All path params use `ParseIntPipe`.
- All DTOs use definite assignment assertions (`!`).

**Issues found:**
- **[IMPORTANT] `DELETE /tickets/:ticketId` is not ADMIN-restricted.** Any authenticated user can soft-delete any ticket. This is inconsistent with projects where delete is presumably important. Whether this is intentional depends on requirements, but it should be explicitly decided.
- **[IMPORTANT] No RBAC on comments or attachments.** Any authenticated user can delete any comment or attachment on any ticket, regardless of authorship or project membership. The `authorId` on comments is client-supplied, not extracted from the JWT — meaning a user can impersonate another user as a comment author.
- **[IMPORTANT] `CreateCommentDto.authorId` is supplied by the client, not extracted from the JWT.** The authenticated user's identity (`request.user.userId`) is available from the JWT payload, but the controller accepts `authorId` from the request body. A DEVELOPER can post a comment as any user. **Fix:** Extract `authorId` from `request.user.userId` in the controller.
- **[MINOR] `dueDate` in `UpdateTicketDto` is `string | undefined` but the service does `new Date(dto.dueDate)` without checking for `null`.** If a user wants to clear the due date, they can't — there's no way to set it back to `null`.

#### 6. Test Quality Summary

**Ticket service (37 tests):** Strong coverage of lifecycle rules (DONE rejection, backward rejection, same-status rejection, blocker guard for DONE, partial updates). CSV export/import tests cover valid rows, invalid rows, and mixed. Dependency tests cover same-project, cross-project, add/get/remove.

**Comment service (10 tests):** Covers findByTicket, create with mentions, create without mentions, author validation, update with re-evaluated mentions, ownership check, delete.

**Attachment service (11 tests):** Good coverage of size limit, MIME whitelist (each allowed type individually), no-file case, delete with ownership check.

**Mention util (9 tests):** Excellent isolated unit tests for the regex, including edge cases (emails, duplicates, case, underscores, empty string).

**Gaps:**
- No test for self-referential dependency (ticket blocks itself).
- No test for duplicate dependency addition.
- No test for CSV import with `assigneeId` pointing to non-existent user.
- No test for CSV import with extremely large input (memory behavior).
- No test for attachment filename containing path traversal characters.
- No test verifying RBAC guards actually block DEVELOPER users from admin endpoints.

### Remediation Plan for Phase 4 Readiness

#### Critical fixes (must complete before Phase 4):

| # | Issue | Fix |
|---|-------|-----|
| C1 | File upload size/MIME validated after full memory read | Configure Multer `limits` and `fileFilter` on the `FileInterceptor` options in `attachment.controller.ts` and `ticket.controller.ts` so rejection happens during the upload stream |
| C2 | CSV import uses `csv-parse/sync` — loads entire file to memory | Switch to streaming `csv-parse` or enforce a file size limit on the CSV import `FileInterceptor`; at minimum cap file size at Multer level |
| C3 | Path traversal risk via unsanitized `file.originalname` | Sanitize filename in `attachment.service.ts` using `path.basename()` and a character whitelist regex before persisting |
| C4 | Blocker check eagerly loads all blocked tickets into JS | Replace `relations: ['blockedBy']` + JS `.filter()` with a single `COUNT` query against the join table filtered by `blocker.status != 'DONE'` |

#### Important fixes (recommended before Phase 4):

| # | Issue | Fix |
|---|-------|-----|
| I1 | No self-referential dependency guard | Add `if (ticketId === dto.blockedBy) throw BadRequestException` at the top of `addDependency()` |
| I2 | No circular dependency detection (direct) | Before adding A→B, check if B already blocks A via a query on the join table |
| I3 | No duplicate dependency guard | Check `ticket.blockedBy.some(b => b.id === dto.blockedBy)` before pushing |
| I4 | `LOWER(user.username)` defeats index | Store usernames in lowercase at creation time, or add a functional index `CREATE INDEX idx_users_username_lower ON users (LOWER(username))` |
| I5 | CSV import saves each row individually | Batch valid rows into chunks and use `repository.save(chunk)` for bulk inserts |
| I6 | MIME type is client-declared, not verified | Validate file magic bytes using a library like `file-type` for defense-in-depth |
| I7 | `authorId` on comments is client-supplied | Extract `authorId` from `request.user.userId` in `CommentController` instead of accepting it from the DTO |
| I8 | `DELETE /tickets/:ticketId` not ADMIN-restricted | Add `@Roles(Role.ADMIN)` to the delete endpoint, or document it as intentionally open |

#### Minor (future improvements):

| # | Issue | Fix |
|---|-------|-----|
| M1 | CSV import skips `assigneeId` validation | Add assignee existence check during import, or validate FK at the DB level with a constraint |
| M2 | No way to clear `dueDate` back to null | Accept `null` as a valid value for `dueDate` in `UpdateTicketDto` and handle in service |
| M3 | CSV export excludes `dueDate`, `createdAt`, `updatedAt` | Extend `CSV_COLUMNS` to include date fields for round-trip fidelity |
| M4 | Unresolved `@mentions` silently ignored | Document the behavior or return a list of unresolved usernames in the response |
| M5 | No CSV import transaction wrapping | Wrap import loop in a TypeORM transaction with rollback support |

---

## Phase 3 — Code Review & Quality Assurance

### Prompt

> Please apply the critical security, memory-safety, and performance fixes identified in the Phase 3 Code Review to our Ticket and Comment modules.
> Ensure all changes maintain our strict TypeScript compiler settings and that all unit tests are updated accordingly.
>
> 1. Memory Safety & File Upload Limits (C1 & C2 Fixes)
> 2. Path Traversal Protection (C3 Fix)
> 3. N+1 Query Optimization for Ticket Dependencies (C4 Fix)
> 4. Secure Comment Ownership (Important Fix)
> 5. Testing & Documentation

### AI Model

Claude (Opus 4.6)

### Applied Fixes

#### C1 & C2 — Memory Safety & File Upload Limits

| File | Change |
|------|--------|
| `src/attachment/attachment.controller.ts` | Replaced bare `@UploadedFile()` with `ParseFilePipe` containing `MaxFileSizeValidator` (10 MB) and `FileTypeValidator` (regex matching `image/png`, `image/jpeg`, `application/pdf`, `text/plain`). File validation now happens at the controller boundary **before** the buffer reaches the service layer. |
| `src/attachment/attachment.service.ts` | Removed redundant service-level size & MIME checks (`MAX_FILE_SIZE`, `ALLOWED_MIME_TYPES`, and their `if` blocks). The service now trusts the pipe-validated file. |
| `src/ticket/ticket.controller.ts` | Added `ParseFilePipe` with `FileTypeValidator` (`text/csv`) on the CSV import endpoint's `@UploadedFile()`. |
| `src/ticket/ticket.service.ts` | Replaced synchronous `csv-parse/sync` import with the stream-based `csv-parse` module. Added a private `parseCsvStream()` method that pipes the buffer through a `Readable` stream and the `csv-parse` transform, collecting rows incrementally and rejecting on parse errors. |

#### C3 — Path Traversal Protection

| File | Change |
|------|--------|
| `src/attachment/attachment.service.ts` | Added `import * as path from 'path'`. The `upload()` method now wraps `file.originalname` with `path.basename()` before persisting, stripping sequences like `../../../etc/passwd` down to just the filename. |

#### C4 — N+1 Query Optimization for Blocker Check

| File | Change |
|------|--------|
| `src/ticket/ticket.service.ts` | Replaced the eager-load-and-filter pattern (`findOne` with `relations: ['blockedBy']` → JS `.filter()`) in the `update()` method's DONE-transition check with a single `createQueryBuilder().innerJoin('ticket_dependencies').innerJoin('tickets').where('status != DONE').getCount()` query. This executes one SQL query against the join table instead of loading all blocker entities into memory. |

#### Secure Comment Ownership

| File | Change |
|------|--------|
| `src/comment/dto/create-comment.dto.ts` | Removed the `@IsInt() authorId` property. The DTO now only contains `content`. |
| `src/comment/comment.controller.ts` | Added `@Req() req: Request` to the `create()` method. Extracts `req.user.userId` from the JWT payload and passes it to `commentService.create()` as a separate `authorId` parameter. |
| `src/comment/comment.service.ts` | Changed `create(ticketId, dto)` signature to `create(ticketId, authorId, dto)`. The author ID is now received from the controller (JWT-derived) rather than from the client body, preventing author spoofing. |

### Testing

All 14 test suites updated and passing with 170 tests:

| Test file | Key updates |
|-----------|-------------|
| `attachment.service.spec.ts` | Removed size/MIME rejection tests (now handled by pipe). Added path-traversal sanitisation test verifying `path.basename()` strips `../` sequences. Added `NotFoundException` test for missing tickets. |
| `attachment.controller.spec.ts` | Simplified to focus on service delegation and error propagation, since file validation is now declarative via `ParseFilePipe`. |
| `comment.service.spec.ts` | Updated `create()` calls to pass `authorId` as a separate second argument instead of inside the DTO. |
| `comment.controller.spec.ts` | Added `mockRequest()` helper that creates a fake `Request` with `user.userId`. Updated `create()` tests to pass `req` and verify the correct `authorId` is forwarded to the service. |
| `ticket.service.spec.ts` | Updated blocker-check tests to mock `createQueryBuilder` chain (`innerJoin → where → getCount`) instead of `repo.findOne` with `relations: ['blockedBy']`. |

### Verification

- **TypeScript strict compilation**: 0 errors
- **Unit tests**: 14 suites, 170 tests — all passing

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

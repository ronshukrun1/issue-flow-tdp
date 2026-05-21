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

## 2. Start the PostgreSQL Database

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

## 3. Run the Application

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

## 4. Run the Tests

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

### End-to-end tests

```bash
npm run test:e2e
```

---

## Phase 1 — What Has Been Implemented

- **TypeORM** configured in `AppModule` to connect to the PostgreSQL instance defined in `compose.yml` (`synchronize: true` for development).
- **Global `ValidationPipe`** enabled in `main.ts` with `whitelist`, `forbidNonWhitelisted`, and `transform` options.
- **User Module** (`src/user/`) containing:
  - `User` entity — `id`, `username` (unique), `email` (unique), `fullName`, `role` (enum: `ADMIN` | `DEVELOPER`).
  - `CreateUserDto` / `UpdateUserDto` — validated via `class-validator`.
  - `UserService` — CRUD operations with graceful duplicate-key error handling.
  - `UserController` — REST endpoints matching the API contract:
    - `GET /users`
    - `GET /users/:userId`
    - `POST /users`
    - `POST /users/update/:userId`
    - `DELETE /users/:userId`
- **Unit tests** for `UserService` and `UserController` (23 tests total).

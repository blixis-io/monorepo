# 007.002 — Create the users module

## Status

```text
completed
```

## Parent plan

[007 — Identity & Authentication](./_index.md)

## Objective

Create `@blixis/users` with the `users` table, repository, `UserService` behind `USER_SERVICE`, user events, and `GET/PATCH /api/v1/users/me` routes.

## Background

§20 assigns the user repository to `@blixis/users`; §23 describes the module layout; §15 lists `user.updated`. The module is the canonical owner of user profile data (email, display name, status).

## Requirements

- Create `modules/users` using the §23 layout (domain, application, infrastructure, rest) — only the directories needed.
- Migration: `users(id uuid pk, email citext unique, display_name, status enum(active, disabled), created_at, updated_at)` (use `citext` or lower-cased unique index — decide).
- `UserService`: `getById`, `getByEmail`, `create` (transactional `user.created` event), `updateProfile` (`user.updated` event), `disable`.
- Public exports: `USER_SERVICE`, `UserService` type, `User` type, event definitions, module factory.
- REST routes use request actor; `/users/me` requires a `user` actor (else `UnauthorizedError`).
- Validation of inputs with the ADR 0004 library at the route boundary; services also validate invariants.
- Module meta: capability `blixis.users`; requires `@blixis/database`, `@blixis/events` capabilities.
- Tests: unit (service with fakes), integration (repository against test DB), API (Workers pool).

## Architectural constraints

- No authentication logic in this module.
- Route handlers contain no business logic (§48 Code.8).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/users/package.json
modules/users/src/application/user.service.ts
modules/users/src/domain/user.test.ts
modules/users/src/domain/user.ts
modules/users/src/events.ts
modules/users/src/index.ts
modules/users/src/infrastructure/migrations/0001_create_users.ts
modules/users/src/infrastructure/schema.ts
modules/users/src/infrastructure/user.repository.ts
modules/users/src/module.ts
modules/users/src/rest/routes.ts
modules/users/test/users.test.ts
modules/users/tsconfig.json
modules/users/tsconfig.test.json
```

### Modify

```text
apps/api/package.json
apps/api/src/blixis.config.ts
apps/api/tsconfig.json
docs/ROADMAP.md
docs/contracts/events.md
docs/plans/007-identity-and-authentication/002-users-module.md
docs/plans/007-identity-and-authentication/_index.md
pnpm-lock.yaml
tsconfig.json
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold the module package.
2. Write migration and repository.
3. Implement service and events.
4. Implement routes.
5. Register in `apps/api` and run migrations locally.
6. Tests at three levels.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export interface UserService {
  getById(id: string): Promise<User | null>
  getByEmail(email: string): Promise<User | null>
  create(input: CreateUserInput, options?: { transaction?: TransactionScope }): Promise<User>
  updateProfile(id: string, input: UpdateProfileInput): Promise<User>
  disable(id: string): Promise<void>
}
export const USER_SERVICE = createServiceToken<UserService>('@blixis/users.service')
```

## Dependencies

Requires:

- [007.001 — Select the authentication approach](./001-select-authentication-approach.md)

## Acceptance criteria

- [x] `pnpm db:migrate` creates the users table via module contribution.
- [x] Creating a user emits `user.created` through the outbox.
- [x] `GET /api/v1/users/me` returns 401 for anonymous actors.
- [x] Package exports expose no repository.

## Validation

```bash
pnpm db:migrate
pnpm --filter @blixis/users test
pnpm --filter @blixis/api test
```

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] Layout follows §23 without empty directories.

## Completion conditions

Change the status to `completed` only when all of the following hold:

1. Implementation is finished and every requirement above is met.
2. Every acceptance criterion is checked.
3. All validation steps pass.
4. The task has passed through `review` and every review checklist item is checked.
5. `Technical notes` are updated with findings from implementation, testing, and review.
6. `Files and folders` reflects the actual change set.
7. The task checkbox and status are updated in [`docs/ROADMAP.md`](../../ROADMAP.md).
8. The parent [`_index.md`](./_index.md) task list, progress count, and plan status are updated (plan becomes `completed` only when all tasks are completed and the plan completion criteria hold).

## Technical notes

- **First package under `modules/`.** The §23 layout keeps only what's needed: `domain/` (types, normalization, schemas), `application/` (service), `infrastructure/` (Drizzle schema, repository, migrations), `rest/`.
- **Package shape:** the platform packages (`@blixis/contracts`, `kernel`, `database`), `drizzle-orm`, and `hono` are **peer dependencies** (packages.md: the host provides them once) and also devDependencies for local builds; `zod` is a dependency. `apps/api` now declares `drizzle-orm` and `hono` directly (autoInstallPeers is off).
- **Email uniqueness, decided:** a normalized (trimmed, lower-cased) `email text` with `unique` plus a `check (email = lower(btrim(email)))` instead of `citext`. Creating the `citext` extension needs privileges `blixis_migrator` doesn't have, and normalization happens in `emailSchema` anyway.
- **Users are global** (no tenant columns): identities span organizations, and membership comes in plan 008. This is an explicit exception to ADR 0007 point 4.
- **Migration as `.ts`** (`0001_create_users.ts`) instead of `.sql`. Node tooling can't import `.sql`, and the migrations convention uses `defineMigration` modules.
- **`UserService`:**
  - `getById` (throws `NotFoundError`), `findById`, `findByEmail` (normalizes), `create`, `updateProfile`, `disable`.
  - `create` validates, inserts, and emits the transactional `user.created` **in the caller's transaction** when one is given (sign-up in 007.003 creates user and credentials atomically); otherwise in its own `withTransaction`.
  - The unique violation is mapped to `ConflictError('A user with this email already exists')`.
  - `updateProfile`/`disable` emit best-effort `user.updated` with `changed` fields.
- **Routes:** `GET/PATCH /api/v1/users/me`. `user` actors act as themselves, `apiToken` actors as their owner (scopes enforced in plan 009), and everything else → `401`. Handlers only call the service.
- **Events** registered in `docs/contracts/events.md` (`user.created` transactional, `user.updated` best-effort).
- **Tests:**
  - 2 domain unit tests (normalization, validation);
  - 6 Postgres integration/API tests (create + event, case-insensitive duplicate → 409, create inside a caller transaction rolls back, update/disable events, `/users/me` for user and token actors, anonymous → 401, invalid → 400).
  - Workers-pool API tests aren't possible with `pg` (known issue); the Node pool covers them via `createTestBlixis`.
- **API:** `usersModule()` registered; bundle 346 KiB gzip; the local `db:migrate` applied `@blixis/users 0001_create_users`. **Staging needs `db:migrate` before the next deploy.**

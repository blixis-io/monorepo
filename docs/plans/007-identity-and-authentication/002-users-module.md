# 007.002 — Create the users module

## Status

```text
not-started
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
modules/users/tsconfig.json
modules/users/src/index.ts
modules/users/src/module.ts
modules/users/src/domain/user.ts
modules/users/src/application/user.service.ts
modules/users/src/infrastructure/user.repository.ts
modules/users/src/infrastructure/migrations/0001_create_users.sql
modules/users/src/rest/routes.ts
modules/users/src/events.ts
modules/users/test/
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/api/package.json
tsconfig.json
docs/contracts/events.md (event decision table)
pnpm-lock.yaml
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

- [ ] `pnpm db:migrate` creates the users table via module contribution.
- [ ] Creating a user emits `user.created` through the outbox.
- [ ] `GET /api/v1/users/me` returns 401 for anonymous actors.
- [ ] Package exports expose no repository.

## Validation

```bash
pnpm db:migrate
pnpm --filter @blixis/users test
pnpm --filter @blixis/api test
```

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Layout follows §23 without empty directories.

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

No technical notes yet.

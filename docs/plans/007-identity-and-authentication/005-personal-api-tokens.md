# 007.005 — Implement personal API tokens

## Status

```text
not-started
```

## Parent plan

[007 — Identity & Authentication](./_index.md)

## Objective

Allow authenticated users to create, list, and revoke personal API tokens for Management API automation, stored hashed with optional expiry and scopes.

## Background

§9 REST Management API is used by automation (CI, migrations scripts, SDK). §30 prefers permission-based checks; token scopes restrict a token to a subset of permissions, enforced by the authorization service in plan 009.

## Requirements

- Migration: `auth_api_tokens(id, user_id, name, prefix, token_hash, scopes text[], expires_at, last_used_at, created_at, revoked_at)`.
- Routes: `GET /api/v1/auth/tokens`, `POST /api/v1/auth/tokens` (returns plaintext once), `DELETE /api/v1/auth/tokens/:id`.
- Bearer resolver implementation producing `Actor { type: 'apiToken', tokenId, ownerId, scopes }`.
- Tokens cannot create other tokens (sessions only) — document.
- Tests: create/list/revoke, expiry, revoked token 401, plaintext never retrievable after creation.

## Architectural constraints

- Only hashes stored; compare via hash lookup (no timing issues on plaintext).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/auth/src/application/api-token.service.ts
modules/auth/src/infrastructure/api-token.repository.ts
modules/auth/src/infrastructure/migrations/0002_create_api_tokens.sql
modules/auth/test/api-tokens.test.ts
```

### Modify

```text
modules/auth/src/rest/routes.ts
modules/auth/src/application/actor-resolver.ts
modules/auth/src/module.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Migration and repository.
2. Service and routes.
3. Bearer resolver.
4. Tests.

## Dependencies

Requires:

- [007.004 — Resolve actors from sessions and bearer tokens](./004-actor-resolution.md)

## Acceptance criteria

- [ ] A created token authenticates `GET /api/v1/auth/me` via bearer header.
- [ ] Revoked or expired tokens return 401.
- [ ] Listing never returns token plaintext or hash.

## Validation

```bash
pnpm --filter @blixis/auth test
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
- [ ] Token prefix format documented for secret scanning.

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

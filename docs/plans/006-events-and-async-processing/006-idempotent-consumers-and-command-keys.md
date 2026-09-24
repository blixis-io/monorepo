# 006.006 — Implement idempotent consumers and command idempotency keys

## Status

```text
not-started
```

## Parent plan

[006 — Events & Async Processing](./_index.md)

## Objective

Implement a processed-events store so each `(subscription id, event id)` is handled at most once, and an idempotency-key store with Hono middleware support for commands such as publish and import.

## Background

§33 requires retry-safe consumers and optional idempotency keys for commands. Queue delivery and outbox sweeps are at-least-once, so without this, redeliveries repeat side effects (duplicate webhooks, duplicate cache purges).

## Requirements

- Migration: `events_processed(subscription_id text, event_id uuid, processed_at timestamptz, primary key (subscription_id, event_id))` with retention.
- Dispatcher wraps each subscription: skip if already processed; on success insert the row. Provide two modes: `after` (insert after handler success — handler must itself be idempotent for crash windows) and `transactional` (handler receives a transaction; marker inserted in the same transaction) — handlers choose.
- Migration: `idempotency_keys(scope text, key text, request_hash text, response jsonb, status, created_at, expires_at, primary key (scope, key))`.
- `IdempotencyService` (`IDEMPOTENCY_SERVICE` token): `run(scope, key, requestHash, fn)` returning the stored result for repeats, `ConflictError` when the same key is reused with a different request hash, and handling in-progress state.
- Hono helper `idempotent()` middleware reading `Idempotency-Key` header for command routes (usable by modules via kernel/`@blixis/events` export — decide the owning package and document).
- Tests for duplicate delivery, concurrent same-key requests, mismatched hash.

## Architectural constraints

- Keys are scoped by tenant + actor + route to prevent cross-tenant replay.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/events/src/idempotency/migrations/0002_create_events_processed.sql
packages/events/src/idempotency/migrations/0003_create_idempotency_keys.sql
packages/events/src/idempotency/processed.ts
packages/events/src/idempotency/keys.ts
packages/events/src/idempotency/middleware.ts
packages/events/src/idempotency/idempotency.test.ts
```

### Modify

```text
packages/events/src/dispatch.ts
packages/events/src/module.ts
packages/events/src/index.ts
packages/contracts/src/index.ts (IDEMPOTENCY_SERVICE token, if public)
docs/contracts/events.md
```

### Delete

```text
None.
```

## Implementation steps

1. Add migrations.
2. Implement processed-events wrapper modes.
3. Implement idempotency service and middleware.
4. Tests.

## Dependencies

Requires:

- [006.005 — Implement the transactional outbox and dispatcher](./005-transactional-outbox.md)

## Acceptance criteria

- [ ] Redelivering the same envelope runs a handler once (both modes).
- [ ] Same idempotency key + same body returns the stored response; different body → 409 `CONFLICT`.

## Validation

```bash
pnpm --filter @blixis/events test
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
- [ ] Retention for both tables handled by the cron job.

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

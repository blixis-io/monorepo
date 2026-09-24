# 006.006 — Implement idempotent consumers and command idempotency keys

## Status

```text
completed
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
packages/database/src/idempotency/idempotency.test.ts
packages/database/src/idempotency/index.ts
packages/database/src/idempotency/middleware.ts
packages/database/src/idempotency/module.ts
packages/database/src/idempotency/service.ts
packages/events/src/outbox/processed.test.ts
packages/events/src/outbox/processed.ts
packages/events/src/processed.ts
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/docs/src/content/docs/concepts/database.mdx
apps/docs/src/content/docs/concepts/events.mdx
docs/ROADMAP.md
docs/operations/database.md
docs/plans/006-events-and-async-processing/006-idempotent-consumers-and-command-keys.md
docs/plans/006-events-and-async-processing/_index.md
packages/contracts/src/events.ts
packages/database/package.json
packages/events/src/dispatch.ts
packages/events/src/index.ts
packages/events/src/outbox/index.ts
packages/events/src/outbox/module.ts
pnpm-lock.yaml
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

- [x] Redelivering the same envelope runs a handler once (both modes).
- [x] Same idempotency key + same body returns the stored response; different body → 409 `CONFLICT`.

## Validation

```bash
pnpm --filter @blixis/events test
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
- [x] Retention for both tables handled by the cron job.

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

- **Contracts:** `EventSubscription.idempotency?: 'after' | 'transactional'` (via a `subscribe` option), `EventHandlerContext.transaction?`, and the `SubscriptionIdempotency` type.
- **Processed events:**
  - Port `PROCESSED_EVENTS` in core `@blixis/events` (optional: without it, no deduplication, e.g. in-process tests). The Postgres implementation is in `@blixis/events/outbox`: table `events.processed(subscription, event_id)` (migration `0002_create_processed` of `outboxModule`) instead of `events_processed`.
  - The subscription key is `<module>#<subscription id>`.
  - `after`: `isProcessed` → skip, else handle, then `markProcessed` (`on conflict do nothing`).
  - `transactional`: `runOnce` inserts the marker first in `withTransaction` and runs the handler with `context.transaction`. A handler error rolls back the marker and its effects together. A concurrent duplicate blocks on the uncommitted marker, then sees the conflict and returns `skipped`.
  - `DispatchResult.status` gains `skipped`, which the consumer treats as success (ack).
  - Retention: the outbox cron deletes markers older than `processedRetentionDays` (default 30).
- **Command idempotency: owning package decided.** It lives in `@blixis/database/idempotency`, not kernel or events: it is generic HTTP command handling backed by the database. The `idempotent()` middleware only uses Hono types (`hono` as a type-only peer, like contracts).
  - Table `blixis.idempotency_keys(scope, key, request_hash, status, response, created/updated/expires_at)`, owned by `idempotencyModule()`, with a TTL of 24 h, expired rows deleted on the cron, and in-progress rows treated as abandoned after 60 s.
  - `IdempotencyService.run(scope, key, requestHash, fn, { shouldStore })`:
    - claims with `insert … on conflict do nothing returning`;
    - a repeat returns the stored result;
    - a different hash → `ConflictError`;
    - in progress → `ConflictError` ("retry later");
    - `fn` throws or `shouldStore` is false → the key is released.
  - Middleware scope: `organizationId|spaceId|actor|method|routePath`, so there is no cross-tenant or cross-actor replay. Hash: SHA-256 of method, path + query, and body. It stores status, content-type, and body text; replays set `Idempotent-Replayed: true`; `5xx` is not stored; the header is optional unless `required: true`, and must be 1–255 visible ASCII characters.
  - Hono converts handler errors inside `next()` into `c.res` (root `onError`), so the middleware sees a 500 response rather than an exception. Hence `shouldStore(status < 500)`.
- **Tests (Postgres):**
  - consumers: redelivery skips everything; a failed subscription is retried alone; transactional rollback, then exactly once; 3 concurrent duplicates → one ledger row;
  - service: replay, hash conflict, per-scope keys, concurrent 409, release on error / not stored, abandoned takeover;
  - middleware over HTTP: replay header, 409 on a different body, per-actor scoping, 5xx not stored, header validation;
  - total 311 with `pnpm test:db`.
- **API:** `idempotencyModule()` registered. `pnpm db:migrate` locally applied `0002_create_processed` and `0001_create_idempotency_keys`. Bundle 342 KiB gzip.
- **Docs:** manual Events → Idempotency, manual Database → Idempotent commands, and the platform-tables table in `docs/operations/database.md`.

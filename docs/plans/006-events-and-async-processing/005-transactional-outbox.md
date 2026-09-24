# 006.005 — Implement the transactional outbox and dispatcher

## Status

```text
completed
```

## Parent plan

[006 — Events & Async Processing](./_index.md)

## Objective

Implement the outbox: an `events_outbox` table owned by `@blixis/events`, an outbox writer used when emitting `transactional` events inside a database transaction, and a dispatcher that moves pending rows to the queue post-commit and via a cron sweep. Record the dispatch strategy in ADR 0008.

## Background

§32 describes exactly this pattern for events whose loss would corrupt system state, and requires documenting the decision per event class. The contracts' opaque `TransactionScope` (002.008) and `@blixis/database` transaction bridge (005.004) connect the event bus to the domain transaction without coupling contracts to the database library.

## Requirements

- ADR 0008: dispatch triggers (post-commit `waitUntil` attempt + cron sweep every minute), ordering guarantees (none globally; per-aggregate ordering not guaranteed — consumers must tolerate), retention (delete or archive dispatched rows after N days), failure handling.
- Migration (owned by `@blixis/events` module): `events_outbox(id uuid pk, type, version, envelope jsonb, created_at, dispatched_at null, attempts int, last_error text null)` with partial index on undispatched rows.
- `emit(def, payload, { transaction })` for `transactional` events inserts into the outbox using the transaction; emitting a transactional event without a transaction throws `ModuleError` (forces correctness).
- Post-commit dispatch: the bus records pending IDs in the request scope; after the transaction commits, schedule `dispatchPending(ids)` with `waitUntil`.
- Cron sweep: scheduled handler selecting undispatched rows (`FOR UPDATE SKIP LOCKED`, batch size N, age > few seconds), sending batches, marking `dispatched_at`.
- Retention job in the same cron.
- Tests: commit → delivered; rollback → nothing; crash between commit and dispatch → sweep delivers; concurrent sweeps do not double-send the same row (at-least-once still possible; document).

## Architectural constraints

- `FOR UPDATE SKIP LOCKED` must run inside a transaction (Hyperdrive transaction mode compatible).
- Outbox writes must use the caller's transaction, never a separate connection.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0008-outbox-dispatch.md
packages/events/src/outbox/dispatch.ts
packages/events/src/outbox/index.ts
packages/events/src/outbox/module.ts
packages/events/src/outbox/outbox.test.ts
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/api/test/entry.worker.test.ts
apps/api/wrangler.jsonc
apps/docs/src/content/docs/concepts/events.mdx
docs/ROADMAP.md
docs/conventions/database.md
docs/decisions/README.md
docs/operations/cloudflare.md
docs/operations/database.md
docs/plans/006-events-and-async-processing/005-transactional-outbox.md
docs/plans/006-events-and-async-processing/_index.md
packages/events/package.json
packages/events/tsconfig.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Write ADR 0008.
2. Add migration and writer.
3. Implement post-commit dispatch and cron sweep.
4. Register the cron trigger in `wrangler.jsonc` and the scheduled handler via the kernel registry.
5. Tests against the test database.

## Dependencies

Requires:

- [006.003 — Implement the Cloudflare Queue producer adapter](./003-cloudflare-queue-producer-adapter.md)
- [006.004 — Implement queue consumer dispatch to module subscriptions](./004-queue-consumer-dispatch.md)

## Acceptance criteria

- [x] ADR 0008 accepted.
- [x] Rollback test: no outbox row, no queue message.
- [x] Sweep test: row inserted without post-commit dispatch is delivered by the sweep.
- [x] Transactional emit without a transaction throws.

## Validation

```bash
docker compose up -d postgres
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
- [x] `docs/contracts/events.md` has the per-event-class decision table template that domain plans fill in.

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

- **Packaging:** the outbox is the subpath `@blixis/events/outbox` (`outboxModule`, `outboxTransport`, `dispatchOutboxBatch`, `sweepOutbox`), so the core `@blixis/events` entry stays free of `pg`. The package gains `@blixis/database` and `drizzle-orm` dependencies and Node types for pg typings.
- **Table** `events.outbox`, in schema `events` per ADR 0007, instead of `events_outbox`. Migration `@blixis/events.outbox` `0001_create_outbox`, with a partial index on `created_at where dispatched_at is null`.
- **Writing:** `outboxTransport()` inserts with `fromTransactionScope(options.transaction)` (the caller's transaction) and records the id in the request-scoped `OUTBOX_PENDING`. The bus already rejects transactional emits without a transaction (006.001).
- **Post-commit dispatch:**
  - `OUTBOX_PENDING`'s **dispose** runs when the request scope ends, which is after `withTransaction` has committed or rolled back. It dispatches only its ids (rolled-back ids match nothing).
  - The REST middleware wraps disposal in `waitUntil`; `runInScope` awaits it.
  - `DATABASE`, `QUEUE_SENDER`, and the logger are resolved in the factory, because the scope is already disposing when dispatch runs. Services are disposed in reverse creation order, so the DB is still open.
  - Failures are logged (`outbox.post_commit_failed`) and left to the sweep.
- **`dispatchOutboxBatch`:**
  - In one transaction: `select … for update skip locked limit N` → one `sendBatch` → `dispatched_at = now()`.
  - On send failure: `attempts + 1` and `last_error` (≤ 1000 chars), rows stay pending, and the transaction commits.
  - `outbox.stuck` is logged at error once `attempts ≥ 10`.
- **Sweep** (cron `* * * * *`, `runInScope` as system actor `@blixis/events.outbox`): batches of 100, at most 10 per run, rows older than 5 s, stopping on failure or a short batch. Then retention deletes rows dispatched more than 7 days ago. All values are configurable.
- **Finding:** Drizzle expands `${array}` in `sql` into a parameter list, so `= any(${ids}::uuid[])` failed with SQLSTATE 42846. Fixed with an explicit `sql.join` list; the pitfall is documented in `docs/conventions/database.md`.
- **Tests:** 5 Postgres integration tests.
  - commit → delivered, correlation kept, row marked;
  - rollback → no row, nothing sent;
  - post-commit send failure → pending with `last_error`, then the sweep delivers;
  - **two concurrent sweeps over 50 rows** → 50 unique sends, both sweeps did work (SKIP LOCKED);
  - young rows are left alone, and old dispatched rows are deleted.
  - Total 297 with `pnpm test:db`.
- **API:**
  - `outboxModule()` registered; `queueTransport({ transactional: outboxTransport() })`.
  - Cron `* * * * *` in `triggers` for local/staging/production.
  - The 004.005 scheduled test uses an unregistered cron (`0 3 * * *`), because the sweep needs Postgres, which the Workers pool can't reach.
  - Bundle 338 KiB gzip.
  - `pnpm db:migrate` against local Postgres applied `0001_create_outbox` from the API config.
- **Deploy prerequisite:** run `db:migrate` on staging (and later production) **before** deploying this. Otherwise the sweep fails every minute (`events.outbox` missing).

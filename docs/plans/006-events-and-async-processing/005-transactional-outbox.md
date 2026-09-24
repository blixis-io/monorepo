# 006.005 — Implement the transactional outbox and dispatcher

## Status

```text
not-started
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
packages/events/src/outbox/migrations/0001_create_events_outbox.sql
packages/events/src/outbox/writer.ts
packages/events/src/outbox/dispatcher.ts
packages/events/src/outbox/outbox.test.ts
```

### Modify

```text
packages/events/src/composite-bus.ts
packages/events/src/module.ts
packages/events/package.json
apps/api/wrangler.jsonc (cron trigger)
docs/contracts/events.md
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

- [ ] ADR 0008 accepted.
- [ ] Rollback test: no outbox row, no queue message.
- [ ] Sweep test: row inserted without post-commit dispatch is delivered by the sweep.
- [ ] Transactional emit without a transaction throws.

## Validation

```bash
docker compose up -d postgres
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
- [ ] `docs/contracts/events.md` has the per-event-class decision table template that domain plans fill in.

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

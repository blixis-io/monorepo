# 006.007 — Verify the event pipeline end to end

## Status

```text
completed
```

## Parent plan

[006 — Events & Async Processing](./_index.md)

## Objective

Prove the whole pipeline inside the Workers runtime with a fixture module: a REST command updates a table and emits a transactional event in one transaction, the outbox dispatches to the queue, the consumer delivers to a subscription exactly once despite forced redelivery; then verify on staging.

## Background

This is architectural checkpoint CP3 (event consistency). It validates §32/§33 behaviour on real Queues semantics before domain modules depend on it.

## Requirements

- Fixture module in `apps/api/test/fixtures` (registered only in tests) with a table, a command route, a transactional event, and a subscription writing a side-effect row.
- Workers-pool test using the local queue simulation: happy path, forced handler failure then success (retry), forced duplicate delivery (idempotent), rolled-back command (no event).
- Staging verification script or manual procedure documented in `docs/operations/events.md` (how to inspect queue, DLQ, outbox backlog).
- Record latency from commit to handler execution (post-commit path vs. sweep path) in plan Technical notes.

## Architectural constraints

- Fixture module must not ship in the production `blixis.config.ts`.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/events/test/fixtures/notes.ts
packages/events/test/pipeline.test.ts
docs/operations/events.md
```

### Modify

```text
packages/events/package.json
README.md
docs/ROADMAP.md
docs/plans/006-events-and-async-processing/_index.md
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Build the fixture module.
2. Write the Workers-pool tests.
3. Write the operations doc.
4. Verify on staging if available.

## Dependencies

Requires:

- [006.006 — Implement idempotent consumers and command idempotency keys](./006-idempotent-consumers-and-command-keys.md)

## Acceptance criteria

- [x] All four scenarios pass in the Workers pool.
- [x] `docs/operations/events.md` explains outbox backlog, DLQ inspection, and replay.

## Validation

```bash
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
- [x] CP3 conclusions recorded in plan Technical notes and in ROADMAP checkpoint section.

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

- **Deviation (location):** the fixture module and the pipeline test live in `packages/events/test/` instead of `apps/api/test/fixtures`, and run in the **Node pool against real Postgres**. `pg` can't open sockets in the Vitest Workers pool (known issue, 005.006), and `apps/api`'s tsconfig uses Worker types only. The Worker queue path itself is covered by `apps/api/test/events.worker.test.ts`. The fixture is never in `blixis.config.ts`.
- **Deviation (queue):** instead of the local queue simulation, a `SimulatedQueue` has Cloudflare semantics (per-message ack/retry, increasing attempts, at-least-once redelivery) and drives `app.queue`. The test app uses the production module set (database, events with queue and outbox transports, outbox, idempotency).
- **The test uses its own database helper**, not `@blixis/testing/database`: `@blixis/testing` depends on `@blixis/events`, so a devDependency back would create a workspace cycle (pnpm warned).
- **Scenarios (PR #57), all passing:**
  - happy path, exactly once;
  - handler failing twice → retried → one effect;
  - duplicate redelivery → no second effect;
  - rolled-back command → no note, outbox row, message, or effect;
  - queue outage → post-commit fails → sweep delivers once;
  - correlation id end to end, plus the processed marker per subscription.
- **Latency:**
  - Local post-commit path: emit → handler p50 **8 ms**, max 10 ms (20 samples; local Postgres; simulated queue, no batching delay).
  - On Cloudflare, add queue batching (`max_batch_timeout` 5 s) and network time.
  - Sweep path: up to 60 s by design (1-minute cron, rows older than 5 s).
- **Staging verification (2026-09-25, version `41b70931`):**
  - The owner ran `db:migrate` (outbox, processed, idempotency) and deployed.
  - `/api/v1/health/ready` → 200 (database 82 ms).
  - `wrangler queues info blixis-events-staging`: producer and consumer `worker:blixis-api-staging`.
  - `wrangler tail`: 12 consecutive `* * * * *` runs (10:13–10:24), all `Ok`.
  - Sentry: no staging issues in 24 h.
- `wrangler tail` doesn't stream from the non-interactive agent shell (no output, and macOS has no `timeout`). The owner ran it; the procedure is in `docs/operations/events.md`.

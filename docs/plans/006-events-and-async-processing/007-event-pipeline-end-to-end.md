# 006.007 — Verify the event pipeline end to end

## Status

```text
in-progress
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
apps/api/test/fixtures/event-fixture-module.ts
apps/api/test/event-pipeline.worker.test.ts
docs/operations/events.md
```

### Modify

```text
apps/api/vitest.config.ts
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

- [ ] All four scenarios pass in the Workers pool.
- [ ] `docs/operations/events.md` explains outbox backlog, DLQ inspection, and replay.

## Validation

```bash
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
- [ ] CP3 conclusions recorded in plan Technical notes and in ROADMAP checkpoint section.

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

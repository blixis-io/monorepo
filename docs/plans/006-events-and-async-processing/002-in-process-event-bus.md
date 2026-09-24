# 006.002 — Implement the in-process event bus

## Status

```text
not-started
```

## Parent plan

[006 — Events & Async Processing](./_index.md)

## Objective

Implement `InProcessEventBus` that dispatches envelopes synchronously (awaited) or deferred to registered subscriptions within the same process, used by tests and local development, and add event helpers to `@blixis/testing`.

## Background

§4 lists `InProcessEventBus` as an adapter; §36 requires event handler tests without Cloudflare. It also defines the dispatch semantics (handler context, errors, correlation) reused by the queue consumer.

## Requirements

- Implement `InProcessEventBus` with modes `immediate` (await handlers) and `deferred` (collect and flush on demand — used to simulate post-commit).
- Shared `dispatchEnvelope(envelope, subscriptions, scopeFactory)` used by both the in-process bus and the queue consumer (006.004): creates a fresh request scope per handler with actor `system`, correlation ID from metadata.
- Handler failure isolation: one handler failing does not prevent others; failures are reported per subscription.
- `@blixis/testing`: `captureEvents()` helper, `flushEvents()`, assertion helpers (`expectEvent(type, predicate)`).

## Architectural constraints

- Same handler context shape as the queue path (no test-only behaviour differences beyond transport).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/events/src/in-process-bus.ts
packages/events/src/dispatch.ts
packages/events/src/in-process-bus.test.ts
packages/testing/src/events.ts
```

### Modify

```text
packages/events/src/index.ts
packages/events/src/module.ts
packages/testing/src/index.ts
packages/testing/src/create-test-blixis.ts
docs/conventions/testing.md
```

### Delete

```text
None.
```

## Implementation steps

1. Implement shared dispatch.
2. Implement the bus modes.
3. Add testing helpers.
4. Tests with fixture modules subscribing to fixture events.

## Dependencies

Requires:

- [006.001 — Scaffold @blixis/events with the event definition registry](./001-scaffold-events-package-and-registry.md)

## Acceptance criteria

- [ ] A fixture module's subscription receives an emitted fixture event in `createTestBlixis`.
- [ ] A failing handler does not block another handler; failure is logged with module and subscription ID.

## Validation

```bash
pnpm test --filter @blixis/events --filter @blixis/testing
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
- [ ] Dispatch code shared with queue consumer path (no duplication).

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

# 006.002 — Implement the in-process event bus

## Status

```text
completed
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
packages/events/src/dispatch.test.ts
packages/events/src/dispatch.ts
packages/events/src/in-process.ts
packages/testing/src/events.test.ts
packages/testing/src/events.ts
```

### Modify

```text
apps/docs/src/content/docs/concepts/events.mdx
apps/docs/src/content/docs/concepts/testing.mdx
docs/ROADMAP.md
docs/plans/006-events-and-async-processing/001-scaffold-events-package-and-registry.md
docs/plans/006-events-and-async-processing/002-in-process-event-bus.md
docs/plans/006-events-and-async-processing/_index.md
packages/events/src/index.ts
packages/kernel/src/background.ts
packages/kernel/src/create-blixis.ts
packages/kernel/src/index.ts
packages/testing/package.json
packages/testing/src/index.ts
packages/testing/tsconfig.json
pnpm-lock.yaml
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

- [x] A fixture module's subscription receives an emitted fixture event in `createTestBlixis`.
- [x] A failing handler does not block another handler; failure is logged with module and subscription ID.

## Validation

```bash
pnpm --filter @blixis/events --filter @blixis/testing test
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
- [x] Dispatch code shared with queue consumer path (no duplication).

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

- **`dispatchEnvelope(raw, { subscriptions, registry, runInScope, logger, attempt })`** will be shared with the queue consumer (006.004):
  - parses the raw envelope first (`parseEnvelope`: shape, known type/version, payload schema), so an invalid envelope reaches no handler;
  - matches subscriptions by type plus accepted versions (`versions` or `[event.version]`);
  - runs matching handlers **concurrently**, each in its own `runInScope` with actor `system` (`component: '@blixis/events'`, `onBehalfOf` = the envelope's actorId), the envelope's correlation id, and tenant (`tenantId` → `organizationId`, `spaceId`);
  - gives each handler a logger bound to eventId/eventType/module/subscription;
  - isolates failures: logged at `error`, returned as `{ subscription: '<module>#<id>', status: 'failed', error }`, and never thrown.
- **Kernel:** new request-scoped `RUN_IN_SCOPE` service (from `@blixis/kernel`). It opens new scopes with the *current invocation's bindings*, so in-process handlers see the same Worker env.
- **`inProcessTransport({ mode })`:**
  - Delivery JSON-round-trips the envelope (as the queue would) before dispatch, so no in-memory objects leak into handlers.
  - `immediate` awaits handlers during `emit`.
  - `deferred` collects envelopes until `flush()`, which loops until no pending envelopes remain (events emitted by handlers are delivered too).
  - Dispatch dependencies are resolved at **publish time**: in deferred mode the emitting request scope has already been disposed when `flush()` runs (`RUN_IN_SCOPE` closures stay valid).
- **`@blixis/testing`: `captureEvents({ mode })`** returns `{ transport, module(), emitted, flush(), expectEvent(type, predicate?) }`. `expectEvent` failures list what was emitted. `flushEvents()` from the spec is `captureEvents().flush()`.
- **Tests:**
  - dispatch: per-handler scopes (distinct service registries), system actor + onBehalfOf, correlation and tenant, version routing (v2 only to `versions: [1, 2]` subscribers), failure isolation with a log line, an invalid envelope → `ValidationError`;
  - deferred flush including nested emits;
  - `captureEvents` over HTTP;
  - 278 tests in total with `pnpm test:db`.
- **Docs:** manual Events → Handling (scopes, isolation, re-validation) and Testing → Events.

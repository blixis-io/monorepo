# 004.003 — Implement the Worker entry adapter for fetch, queue, and scheduled

## Status

```text
completed
```

## Parent plan

[004 — Cloudflare Worker Runtime](./_index.md)

## Objective

Implement `createWorkerHandler(app)` in `@blixis/cloudflare` producing an `ExportedHandler` with `fetch`, `queue`, and `scheduled` that create per-invocation request scopes, pass env/`ExecutionContext` into the kernel, and dispatch queue batches and cron triggers to kernel-registered handlers.

## Background

§4 lists "Queue consumer helpers" and "Cloudflare request context utilities" under `@blixis/cloudflare`; §2.4 says the same services are called from REST, queue consumers, Workflows, and scheduled Workers. The kernel must therefore expose a transport-neutral way to run code inside a request scope, and the Worker adapter must use it for all three entry types.

## Requirements

- Add to the kernel a transport-neutral API: `app.runInScope(seed, fn)` creating a request scope (actor `system` for background work, correlation ID from event metadata when present) and disposing it afterwards — update `@blixis/kernel` accordingly.
- Add kernel registries for background entry handlers: `queueHandlers` (keyed by queue name) and `scheduledHandlers` (keyed by cron expression) that infrastructure packages register during setup (plan 006 registers the event consumer; plan 006/013 register cron sweeps). Keep these kernel-level (not module contract) unless modules need them directly — document.
- `createWorkerHandler(app)`:
  - `fetch(req, env, ctx)`: passes env into Hono bindings, registers request-scope disposal with `ctx.waitUntil`;
  - `queue(batch, env, ctx)`: resolves handler by `batch.queue`; unknown queue → log error and `retryAll()`;
  - `scheduled(controller, env, ctx)`: resolves handler(s) by `controller.cron`; unknown cron → log warning.
- Make env available to request-scoped factories through the resolution context (not via global mutable state).
- Update `apps/api/src/index.ts` to `export default createWorkerHandler(app)`.

## Architectural constraints

- No global mutable env storage; env flows through invocation context (§48 Code.6).
- No floating promises: all background work goes through `waitUntilSafe`.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/kernel/src/background.ts
packages/kernel/src/background.test.ts
packages/cloudflare/src/worker-handler.ts
packages/cloudflare/src/worker-handler.test.ts
```

### Modify

```text
packages/contracts/src/services.ts (ServiceResolutionContext.bindings)
packages/kernel/src/create-blixis.ts (runInScope, queue, scheduled)
packages/kernel/src/internal/services.ts
packages/kernel/src/internal/rest.ts
packages/kernel/src/index.ts
packages/cloudflare/package.json
packages/cloudflare/tsconfig.json
packages/cloudflare/src/index.ts
apps/api/src/index.ts
biome.json (useLiteralKeys off)
pnpm-lock.yaml
docs/kernel/README.md
apps/docs/src/content/docs/concepts/services-and-capabilities.mdx
docs/ROADMAP.md
docs/plans/004-cloudflare-worker-runtime/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Add `runInScope` and background handler registries to the kernel with tests.
2. Implement `createWorkerHandler` in `@blixis/cloudflare`.
3. Wire `apps/api`.
4. Unit-test dispatch logic with fake batches/controllers.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export function createWorkerHandler<E extends CloudflareEnvBase>(
  app: BlixisApp,
): ExportedHandler<E>

// kernel
interface BlixisApp {
  runInScope<T>(seed: ScopeSeed, fn: (ctx: RequestContext) => Promise<T>): Promise<T>
}
```

## Dependencies

Requires:

- [004.002 — Create the apps/api Worker application](./002-create-api-worker-app.md)

## Acceptance criteria

- [x] Queue batches for an unregistered queue are retried and logged.
- [x] Request-scoped services are disposed after `fetch`, `queue`, and `scheduled` invocations.
- [x] `apps/api` still serves health via `wrangler dev`.

## Validation

```bash
pnpm --filter @blixis/kernel --filter @blixis/cloudflare test
pnpm --filter @blixis/api dev
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
- [x] Kernel remains free of Cloudflare types (adapter holds all Cloudflare specifics).

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

- **Kernel API:** `app.runInScope(seed, fn)`, `app.queue(batch, env, ctx)`, `app.scheduled(event, env, ctx)`, and the `BACKGROUND_HANDLERS` service (`onQueue`, `onScheduled`) — registration only during setup, then locked; one consumer per queue; several jobs per cron. Structural `QueueBatchLike` / `ScheduledEventLike` keep Cloudflare types out of the kernel (Cloudflare's `MessageBatch` and `ScheduledController` fit them).
- **Decisions:** unknown queue → error log + `retryAll()` (never silent ack); unknown cron → warning; failing jobs → all jobs still run, then `AggregateError` so the invocation shows as failed. Background handlers get `{ logger, runInScope }` and create one scope per unit of work; default actor `system:@blixis/kernel`; `correlationId` seedable (events will pass it from envelope metadata).
- **Env access without global state:** contracts `ServiceResolutionContext.bindings` (additive) carries the invocation's platform bindings (Worker `env`) into request-scoped factories; `{}` for app scope. HTTP passes `c.env`, background passes the Worker `env`. Documented as platform-only (TSDoc + manual).
- `@blixis/cloudflare` `createWorkerHandler<Env>(app)` → `ExportedHandler` with `fetch`/`queue`/`scheduled`; `apps/api` now `export default createWorkerHandler<Env>(app)`. `@blixis/cloudflare` depends on `@blixis/kernel` (types + app).
- **Biome vs. TypeScript conflict:** Biome's `complexity/useLiteralKeys` demands `bindings.DB_URL`, while our `noPropertyAccessFromIndexSignature` requires `bindings['DB_URL']`; the rule is off in `biome.json` (compiler flag wins).
- Tests: 7 kernel background tests (per-unit scopes with bindings + disposal, unknown queue retry, cron fan-out + failure aggregation, locking, duplicate consumer, `runInScope` actor/tenant, HTTP bindings) and a Worker-handler test (fetch/queue/scheduled routing). Suite 174 tests. Bundle after change: 869.55 KiB / 144.29 KiB gzip.
- Deviation: the task put request-scope disposal on `ctx.waitUntil` for all entry types; background handlers **await** disposal instead (the invocation is already asynchronous, so no response is delayed). HTTP still uses `waitUntil` (003.006).

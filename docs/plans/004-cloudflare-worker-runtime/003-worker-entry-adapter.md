# 004.003 — Implement the Worker entry adapter for fetch, queue, and scheduled

## Status

```text
not-started
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
packages/cloudflare/src/worker-handler.ts
packages/cloudflare/src/worker-handler.test.ts
```

### Modify

```text
packages/kernel/src/create-blixis.ts
packages/kernel/src/internal/services.ts
packages/kernel/src/index.ts
packages/cloudflare/src/index.ts
apps/api/src/index.ts
docs/kernel/README.md
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

- [ ] Queue batches for an unregistered queue are retried and logged.
- [ ] Request-scoped services are disposed after `fetch`, `queue`, and `scheduled` invocations.
- [ ] `apps/api` still serves health via `wrangler dev`.

## Validation

```bash
pnpm test --filter @blixis/kernel --filter @blixis/cloudflare
pnpm --filter @blixis/api dev
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
- [ ] Kernel remains free of Cloudflare types (adapter holds all Cloudflare specifics).

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

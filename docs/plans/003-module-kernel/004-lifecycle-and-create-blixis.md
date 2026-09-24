# 003.004 — Implement the setup/boot lifecycle and createBlixis

## Status

```text
not-started
```

## Parent plan

[003 — Module Kernel](./_index.md)

## Objective

Implement `createBlixis({ modules, ... })` executing the §43 sequence — validate graph, create registries, run `setup` hooks in module order, run `boot` hooks lazily on first use — and return a `BlixisApp` object exposing the Hono app and kernel handles.

## Background

§27 defines phases define → validate → register → boot → ready. §12 shows `export default app`. On Workers, module initialisation at global scope may not do I/O, so the kernel must build synchronously and defer async boot to the first request (memoised promise). Worker-specific handlers are added in plan 004; here `BlixisApp` provides `fetch(request, env, ctx)` compatible with Hono.

## Requirements

- Implement `createBlixis(options)`; options: `modules`, optional `logger`, optional `actorResolver` (default: anonymous), optional `onError` hook.
- Sequence: graph validation (003.002) → config validation (003.005) → container creation → `setup` per module in order, each with a module-bound `ModuleSetupContext` → registries sealed (no further `provide` calls after setup) → REST mounting (003.006) → contribution collection (003.007).
- `boot` hooks run once, lazily, before the first request/event is handled; failures reject every waiting request with a `ModuleError` naming the module and are retried on the next request (not cached as permanent failure) — document the decision.
- Expose `BlixisApp` with `fetch`, `hono` (the root Hono instance), `services` (app-scope registry, read-only), `modules` (read-only metadata), and `ready(): Promise<void>`.
- Wrap all hook errors in `ModuleError` including module name and phase.
- Tests: ordering of setup/boot, setup error attribution, boot laziness (boot not called before first fetch), boot retry after failure, sealed registry.

## Architectural constraints

- `createBlixis` must be synchronous (so `export default createBlixis(...)` works at module top level); async work only in boot.
- Setup hooks must not perform I/O (documented rule; not enforceable, but tests use fixtures respecting it).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/kernel/src/create-blixis.ts
packages/kernel/src/create-blixis.test.ts
packages/kernel/src/internal/lifecycle.ts
docs/kernel/README.md
```

### Modify

```text
packages/kernel/src/index.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Implement lifecycle orchestration using the graph and container.
2. Implement module-bound setup contexts (logger child with `module` field).
3. Implement lazy memoised boot with retry-on-failure semantics.
4. Expose `BlixisApp`.
5. Tests and `docs/kernel/README.md` (bootstrap sequence diagram, rules for setup vs boot).

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export interface BlixisApp {
  readonly hono: Hono<BlixisHonoEnv>
  readonly services: ServiceRegistry
  readonly modules: readonly ModuleMeta[]
  fetch(request: Request, env?: unknown, ctx?: ExecutionContextLike): Promise<Response>
  ready(): Promise<void>
}
export function createBlixis(options: CreateBlixisOptions): BlixisApp
```

## Dependencies

Requires:

- [003.003 — Implement the service registry with app and request scopes](./003-service-registry-and-scopes.md)

## Acceptance criteria

- [ ] Setup hooks run in dependency order; boot hooks run once on the first `fetch`.
- [ ] A throwing setup hook produces `ModuleError` with module name and phase `setup`.
- [ ] Calling `provide` after setup throws.
- [ ] `docs/kernel/README.md` documents the bootstrap sequence from §43 as implemented.

## Validation

```bash
pnpm test --filter @blixis/kernel
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
- [ ] Boot retry semantics documented and tested.

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

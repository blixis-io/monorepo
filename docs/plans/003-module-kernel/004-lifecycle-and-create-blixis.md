# 003.004 — Implement the setup/boot lifecycle and createBlixis

## Status

```text
completed
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
packages/kernel/src/logger.ts
docs/kernel/README.md
```

### Modify

```text
packages/kernel/src/index.ts
packages/kernel/tsconfig.json (lib webworker)
packages/kernel/tsconfig.test.json
apps/docs/src/content/docs/getting-started/introduction.mdx
apps/docs/src/content/docs/concepts/modules.mdx
docs/ROADMAP.md
docs/plans/003-module-kernel/_index.md
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

- [x] Setup hooks run in dependency order; boot hooks run once on the first `fetch`.
- [x] A throwing setup hook produces `ModuleError` with module name and phase `setup`.
- [x] Calling `provide` after setup throws.
- [x] `docs/kernel/README.md` documents the bootstrap sequence from §43 as implemented.

## Validation

```bash
pnpm --filter @blixis/kernel test
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
- [x] Boot retry semantics documented and tested.

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

- **Deviation — lazy setup:** the task placed `setup` inside `createBlixis`. The module contract allows **async** `setup` hooks, and `createBlixis` must stay synchronous (`export default createBlixis(...)`), so `setup` and `boot` both run lazily in `ready()` (first request/event). Graph validation stays synchronous so misconfiguration still fails at startup. REST mounting (003.006) uses static `rest` contributions, so it does not depend on setup having run.
- **Failure semantics:** setup failure cached (configuration error; retrying would duplicate provider registrations); boot failure retried from the failed module; concurrent `ready()` calls share one in-flight boot. Hook errors wrapped as `ModuleError` "`[module] <phase> failed: <message>`" with `cause`; thrown `ModuleError`s pass through.
- `BlixisApp`: `hono`, `services` (app scope), `modules` (metadata in bootstrap order), `ready()`, `fetch(request, env?, ctx?)` (awaits `ready()`, then Hono). `ExecutionContextLike` keeps Workers types out of the kernel.
- **Logger:** `createJsonLogger` (JSON lines, level filter, bound fields, `child`) and `noopLogger` added now, because hooks receive `ctx.logger`; the full platform logger with redaction remains 020.001. One `biome-ignore` for `console` in the default sink.
- **TypeScript 7.0.2 bug found:** `{@link BlixisApp.ready}` in the JSDoc of a method declared *inside* `BlixisApp` caused `TS2304: Cannot find name 'Request'/'Response'` for that signature; bisected with probe files. Replaced by backticks; recorded in `docs/kernel/README.md` (candidate for an upstream report).
- Kernel tsconfigs add `lib: ["es2023", "webworker"]` for `Request`/`Response`/`console`; the shared base preset stays ES-only.
- Tests (9): synchronous graph validation, bootstrap-order metadata, setup/boot order + laziness + once, cross-module services + config + module logger, boot not before first fetch (unknown route → 404), setup error attribution + caching, boot retry without repeating successful boots, sealed registry, JSON logger.
- Manual: "Composing an application" section and updated package status; `docs/kernel/README.md` holds maintainer notes (bootstrap sequence, failure semantics, gotchas).

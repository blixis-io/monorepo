# 003.003 — Implement the service registry with app and request scopes

## Status

```text
not-started
```

## Parent plan

[003 — Module Kernel](./_index.md)

## Objective

Implement the typed service registry used by modules (`ctx.services.provide/get`) with two scopes — app (per isolate) and request (per incoming request/event) — and duplicate-provider detection; finalise the `@experimental` scope contract from 002.003.

## Background

§7 defines typed tokens and `provide/get`. On Cloudflare Workers, I/O objects (database clients, sockets, streams) created in one request cannot be used from another request, so services that hold connections must be created per request, while pure services can be app-scoped. This is a design decision the architecture does not make explicitly; this task makes it and records it (ADR 0005).

## Requirements

- Write ADR 0005 "Service scopes on Workers" documenting: app scope (values or lazy factories created once per isolate, no I/O objects), request scope (factories invoked at most once per request context and disposed at the end), how request scopes are created by transports (REST middleware, queue consumer, Workflow step), and the rule that app-scoped services must not capture request-scoped ones.
- Implement `ServiceContainer` with:
  - `provide(token, value)` (app scope),
  - `provideFactory(token, factory, { scope })`,
  - `createRequestScope(requestContextSeed)` returning a child registry,
  - optional `dispose` hooks for request-scoped values executed after the response (`waitUntil`-friendly promise returned).
- Detect duplicate providers for the same token at setup time (§26), naming both modules.
- `get` for a missing token throws `ModuleError` naming the requesting module (when known) and the token name.
- Detect scope violations: an app-scoped factory resolving a request-scoped token throws.
- Update contracts (remove `@experimental` or adjust shapes) in the same change if the design differs.
- Tests: duplicates, missing, scope isolation between two concurrent request scopes, disposal order, scope violation.

## Architectural constraints

- No global state: containers are created per `createBlixis` call.
- Constant-time lookup (Map keyed by `token.id`).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0005-service-scopes.md
packages/kernel/src/internal/services.ts
packages/kernel/src/internal/services.test.ts
```

### Modify

```text
packages/contracts/src/services.ts
packages/contracts/src/context.ts
docs/contracts/README.md
```

### Delete

```text
None.
```

## Implementation steps

1. Write ADR 0005.
2. Implement the container and request scope.
3. Implement duplicate/missing/scope-violation errors with module attribution.
4. Adjust contracts if needed.
5. Tests.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
interface ServiceContainer extends ServiceRegistry {
  provide<T>(token: ServiceToken<T>, value: T): void
  provideFactory<T>(
    token: ServiceToken<T>,
    factory: (ctx: ServiceResolutionContext) => T | Promise<T>,
    options: { scope: 'app' | 'request'; dispose?: (value: T) => Promise<void> | void },
  ): void
  createRequestScope(seed: RequestScopeSeed): RequestServiceScope
}
```

## Dependencies

Requires:

- [003.002 — Implement module graph validation and ordering](./002-module-graph-validation.md)

## Acceptance criteria

- [ ] ADR 0005 accepted.
- [ ] Two concurrent request scopes never share a request-scoped instance (test).
- [ ] Registering the same token twice fails naming both modules.
- [ ] Disposal hooks run once per request scope.

## Validation

```bash
pnpm test --filter @blixis/kernel
pnpm test --filter @blixis/contracts
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
- [ ] Design is compatible with Hyperdrive per-request clients (cross-check Cloudflare docs; note in Technical notes).

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

# 002.003 — Define typed service tokens and capability identifiers

## Status

```text
not-started
```

## Parent plan

[002 — Public Contracts](./_index.md)

## Objective

Implement `ServiceToken<T>`, `createServiceToken`, the `ServiceRegistry` read/provide interfaces, service scope types, and the capability identifier type with naming rules.

## Background

§7 mandates typed service tokens instead of string lookup; §8 introduces capabilities so modules can depend on behaviour rather than package names. Service *scopes* matter on Workers: I/O objects (such as database connections) cannot be shared across requests, so the contract must be able to express request-scoped services even though the registry itself is implemented in plan 003 (task 003.003 decides the final scope model).

## Requirements

- Implement `ServiceToken<T>` and `createServiceToken<T>(name)` using `Symbol.for(name)` exactly as §7 describes, plus a phantom type field so tokens of different `T` are not assignable to each other.
- Define `ServiceRegistry` (read: `get`, `getOptional`, `has`) and `ServiceProvider` (write: `provide`) interfaces.
- Define `ServiceScope = 'app' | 'request'` and a provider form that accepts either a value or a factory `(scope: ServiceResolutionContext) => T` — mark it `@experimental` until 003.003 confirms the design.
- Define `CapabilityId` as a template-literal-friendly string type with documented naming convention `<namespace>.<capability>` (first-party namespace `blixis.*`, e.g. `blixis.content`, `blixis.assets`, `blixis.events`).
- Export a `BLIXIS_CAPABILITIES` constant listing first-party capability identifiers planned in the architecture (`blixis.auth`, `blixis.users`, `blixis.spaces`, `blixis.permissions`, `blixis.content`, `blixis.assets`, `blixis.webhooks`, `blixis.events`, `blixis.database`).
- Unit tests: tokens with the same name are identical by `id`; tokens with different names differ; type test that `get(TOKEN)` returns `T`.

## Architectural constraints

- No global mutable registry in contracts; contracts only define shapes and pure helpers (§48 Code.6: avoid hidden global state).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/contracts/src/services.test.ts
packages/contracts/src/services.test-d.ts
```

### Modify

```text
packages/contracts/src/services.ts
packages/contracts/src/capabilities.ts
packages/contracts/src/index.ts
docs/contracts/README.md
```

### Delete

```text
None.
```

## Implementation steps

1. Implement token type and factory.
2. Define registry/provider interfaces and scope types.
3. Define capability type, naming convention, and constant list.
4. Write runtime and type tests.
5. Document tokens and capabilities for module authors.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export interface ServiceToken<T> {
  readonly id: symbol
  readonly name: string
  /** @internal phantom */ readonly __type?: T
}
export function createServiceToken<T>(name: string): ServiceToken<T>

export interface ServiceRegistry {
  get<T>(token: ServiceToken<T>): T            // throws ModuleError if missing
  getOptional<T>(token: ServiceToken<T>): T | undefined
  has(token: ServiceToken<unknown>): boolean
}
```

## Dependencies

Requires:

- [002.001 — Scaffold the @blixis/contracts package](./001-scaffold-contracts-package.md)

## Acceptance criteria

- [ ] `createServiceToken('x').id === createServiceToken('x').id`.
- [ ] Type test: `registry.get(createServiceToken<number>('n'))` has type `number`.
- [ ] Type test: a `ServiceToken<string>` is not assignable where a `ServiceToken<number>` is expected.
- [ ] Capability naming convention documented with examples.

## Validation

```bash
pnpm --filter @blixis/contracts test
pnpm typecheck
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
- [ ] Scope types marked `@experimental` pending 003.003.

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

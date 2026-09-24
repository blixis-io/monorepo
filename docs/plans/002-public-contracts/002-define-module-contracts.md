# 002.002 — Define module, metadata, contribution, and lifecycle contracts

## Status

```text
not-started
```

## Parent plan

[002 — Public Contracts](./_index.md)

## Objective

Define the `BlixisModule` contract, `ModuleMeta`, contribution types (REST, GraphQL, permissions, events, migrations), module factory types, and the setup/boot lifecycle context interfaces.

## Background

§5, §6, §26, §27, and §43 describe the module contract and the kernel bootstrap sequence. This is the single most important public contract: first-party modules and third-party packages implement it identically (§2.2). The lifecycle is intentionally small (§27: setup and boot only).

## Requirements

- Define `ModuleMeta` with `name`, `version`, optional `requires` (package name → semver range), `capabilities`, `requiresCapabilities`, and optional `description`.
- Define `BlixisModule<TConfig>` with `meta`, `setup?`, `boot?`, `rest?`, `graphql?`, `permissions?`, `events?` (subscriptions), `migrations?`.
- Define `ModuleSetupContext<TConfig>`: access to `config` (validated), `services` (provide/get), `events` (subscribe/definitions registration as needed), `logger` (minimal interface), module `meta`.
- Define `ModuleBootContext`: `services.get`, `logger`, read-only view of the registered module graph.
- Define `RestContribution` (`path`, `app`) — decide Hono typing approach (see plan open question) and record the decision in Technical notes and `docs/contracts/README.md`.
- Define `GraphQLContribution` (`typeDefs` as string or string[], `resolvers` as a typed resolver map) without importing a GraphQL server.
- Define `ModuleFactory<TOptions>` type: `(options?: TOptions) => BlixisModule` (the kernel's `defineModule` helper implements it in plan 003).
- Define `ModuleConfigSchema` hook: a module may declare `configSchema` (Standard Schema, from 002.005) so the kernel can validate configuration (§26 invalid module configuration).
- Add a type test: a sample `@vendor/blixis-seo`-style module object that satisfies `BlixisModule` using only contracts imports.

## Architectural constraints

- If Hono types are referenced, it must be `import type` only, with `hono` as a `peerDependency` (optional: false) — no runtime import (§4).
- Keep the lifecycle to setup and boot (§27). Do not add more hooks.
- All collections are `readonly` arrays.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/contracts/src/module.test-d.ts
```

### Modify

```text
packages/contracts/src/module.ts
packages/contracts/src/index.ts
packages/contracts/package.json
docs/contracts/README.md
```

### Delete

```text
None.
```

## Implementation steps

1. Decide the Hono typing approach; if peer dependency, add `hono` to `peerDependencies` and `devDependencies`.
2. Write `ModuleMeta`, contribution types, lifecycle contexts, `BlixisModule`, `ModuleFactory`.
3. Reference the not-yet-written `ServiceRegistry`, `EventSubscription`, `PermissionDefinition`, `MigrationDefinition`, and `StandardSchemaV1` types by creating minimal forward declarations in their concern files (completed by later tasks in this plan), or order the work so those files are written first.
4. Add the sample third-party module type test.
5. Document the module contract in `docs/contracts/README.md`.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export interface ModuleMeta {
  readonly name: string
  readonly version: string
  readonly description?: string
  readonly requires?: Readonly<Record<string, string>>
  readonly capabilities?: readonly CapabilityId[]
  readonly requiresCapabilities?: readonly CapabilityId[]
}

export interface BlixisModule<TConfig = unknown> {
  readonly meta: ModuleMeta
  readonly configSchema?: StandardSchemaV1<unknown, TConfig>
  readonly setup?: (ctx: ModuleSetupContext<TConfig>) => void | Promise<void>
  readonly boot?: (ctx: ModuleBootContext) => void | Promise<void>
  readonly rest?: RestContribution
  readonly graphql?: GraphQLContribution
  readonly permissions?: readonly PermissionDefinition[]
  readonly events?: readonly EventSubscription[]
  readonly migrations?: readonly MigrationDefinition[]
}
```

## Dependencies

Requires:

- [002.001 — Scaffold the @blixis/contracts package](./001-scaffold-contracts-package.md)

## Acceptance criteria

- [ ] The sample third-party module type test compiles importing only `@blixis/contracts` (and `hono` types if the peer approach is chosen).
- [ ] A type test proves a module missing `meta.name` fails to compile.
- [ ] No runtime import of `hono` exists in the built output of contracts.
- [ ] The Hono typing decision is documented.

## Validation

```bash
pnpm typecheck
pnpm test --filter @blixis/contracts
grep -R "from 'hono'" packages/contracts/dist || echo "no runtime hono import"
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
- [ ] Lifecycle limited to `setup`/`boot`.
- [ ] Contract is expressible by a third-party package without kernel imports (kernel only needed for the `defineModule` convenience helper).

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

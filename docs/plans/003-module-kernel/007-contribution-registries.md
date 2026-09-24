# 003.007 — Collect event, GraphQL, permission, and migration contributions

## Status

```text
completed
```

## Parent plan

[003 — Module Kernel](./_index.md)

## Objective

Collect non-REST contributions from modules into read-only registries exposed by the kernel — event subscriptions, GraphQL contributions, permission definitions, and migrations — with conflict detection, so later plans (events, GraphQL, permissions, database) can consume them.

## Background

§43 lists "compose GraphQL schema" and "register event handlers" in bootstrap; §26 includes conflicting GraphQL definitions; §5 lists permissions and migrations on modules. Composition itself happens in owning packages (GraphQL in plan 012, event dispatch in plan 006, migrations in plan 005), but collection and naming-conflict checks belong to the kernel.

## Requirements

- `permissions`: collect all definitions; fail on duplicate permission IDs across modules; fail if a permission ID's first segment does not match a namespace the module owns (rule: first segment must be declared by the module — define "namespace ownership" simply, e.g. `meta.permissionNamespace` or derived from module name; document).
- `events`: collect subscriptions with module attribution; fail on duplicate subscription `id` within a module.
- `graphql`: collect `typeDefs`/`resolvers` with module attribution (no parsing yet; plan 012 parses and detects type conflicts).
- `migrations`: collect with module attribution, validate ID format and uniqueness per module.
- Expose `app.contributions` (read-only) and a `KERNEL_CONTRIBUTIONS` service token so infrastructure packages can read them.
- Tests for each registry and conflict.

## Architectural constraints

- Registries are immutable after bootstrap.
- The kernel must not import GraphQL or database libraries.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/kernel/src/contributions.ts
packages/kernel/src/contributions.test.ts
```

### Modify

```text
packages/kernel/src/create-blixis.ts
packages/kernel/src/index.ts
docs/kernel/README.md
apps/docs/src/content/docs/concepts/permissions.mdx
apps/docs/src/content/docs/concepts/events.mdx
apps/docs/src/content/docs/concepts/context-and-migrations.mdx
docs/ROADMAP.md
docs/plans/003-module-kernel/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Define registry shapes and token.
2. Implement collection with attribution.
3. Implement conflict checks.
4. Tests and docs.

## Dependencies

Requires:

- [003.004 — Implement the setup/boot lifecycle and createBlixis](./004-lifecycle-and-create-blixis.md)

## Acceptance criteria

- [x] Duplicate permission IDs across two modules fail bootstrap naming both.
- [x] Contributions are readable via `KERNEL_CONTRIBUTIONS` in a fixture module's boot hook.
- [x] Migrations carry the owning module name.

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
- [x] Namespace-ownership rule documented and simple.

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

- `collectContributions(modules)` → `{ contributions, problems }`; `createBlixis` runs it synchronously after graph validation and throws `ModuleValidationError` on problems. Contributions are attributed (`{ module, value }`), in bootstrap order, frozen; exposed as `app.contributions` and via the app-scoped `KERNEL_CONTRIBUTIONS` token (provided by `@blixis/kernel` before module setup so boot hooks and platform packages can read it).
- **Namespace-ownership rule** (decided here, no contract change needed): the first segment of a permission id (`seo` in `seo.read`) belongs to the first module in bootstrap order that declares it; another module using it fails. Plus: valid ids, no duplicates (within or across modules, naming both).
- Subscriptions: ids unique per module (they key processed-event records, §33). Migrations: `NNNN_snake_case` ids (same rule as `defineMigration`, re-checked because modules may build migration objects by hand) and unique per module.
- GraphQL contributions are only collected; parsing and type conflict detection belong to `@blixis/graphql` (012.002). The kernel imports no GraphQL or database library.
- Exported publicly: `collectContributions`, `KERNEL_CONTRIBUTIONS`, `KernelContributions`, `Attributed`. Manual updated (permissions namespaces, subscription ids, migration ids); maintainer notes in `docs/kernel/README.md`.
- Tests (4 groups): collection/ordering/freezing, every conflict type, cross-module duplicate naming both modules, end-to-end via `createBlixis` (startup failure + token access in `boot`). Suite: 153 tests.

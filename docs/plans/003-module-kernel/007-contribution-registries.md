# 003.007 — Collect event, GraphQL, permission, and migration contributions

## Status

```text
not-started
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
packages/kernel/src/internal/contributions.ts
packages/kernel/src/internal/contributions.test.ts
```

### Modify

```text
packages/kernel/src/create-blixis.ts
packages/kernel/src/index.ts
packages/contracts/src/module.ts (if namespace ownership needs a field)
docs/kernel/README.md
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

- [ ] Duplicate permission IDs across two modules fail bootstrap naming both.
- [ ] Contributions are readable via `KERNEL_CONTRIBUTIONS` in a fixture module's boot hook.
- [ ] Migrations carry the owning module name.

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
- [ ] Namespace-ownership rule documented and simple.

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

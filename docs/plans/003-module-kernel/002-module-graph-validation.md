# 003.002 — Implement module graph validation and ordering

## Status

```text
not-started
```

## Parent plan

[003 — Module Kernel](./_index.md)

## Objective

Implement bootstrap validation of the module set per §26 and compute a deterministic module order from `requires` and capability dependencies.

## Background

§26 lists validations: duplicate names, incompatible versions, missing required packages, missing capabilities, conflicting routes, conflicting GraphQL definitions, duplicate service providers, invalid config. Graph-level checks (names, versions, requires, capabilities, cycles) happen here; route/GraphQL/service/config conflicts are detected by the tasks that own those registries.

## Requirements

- Implement `validateModuleGraph(modules)` returning an ordered list or throwing `ModuleError` (aggregate: report *all* problems, each naming the module).
- Checks: duplicate `meta.name`; invalid `meta.version` (semver); `requires` entries whose package is absent or whose version does not satisfy the range; `requiresCapabilities` not provided by any module; dependency cycles (via requires + capability providers).
- Ordering: topological sort; ties broken by registration order (stable, deterministic).
- Choose a Workers-safe semver implementation (small dependency or minimal internal implementation supporting `^`, `~`, exact, `>=`); justify in Technical notes.
- Tests covering each failure mode and ordering stability.

## Architectural constraints

- Error messages must name the offending module and the missing/conflicting item (§26).
- No special-casing of `@blixis/*` names.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/kernel/src/internal/graph.ts
packages/kernel/src/internal/graph.test.ts
packages/kernel/src/internal/semver.ts (only if implemented internally)
```

### Modify

```text
packages/kernel/package.json (if a semver dependency is added)
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Implement name/version validation.
2. Implement requires and capability resolution.
3. Implement cycle detection and topological ordering.
4. Aggregate errors into one `ModuleError` with a readable multi-line message.
5. Write tests.

## Dependencies

Requires:

- [003.001 — Scaffold @blixis/kernel and implement defineModule](./001-scaffold-kernel-and-define-module.md)

## Acceptance criteria

- [ ] Duplicate names, bad versions, missing packages, version mismatches, missing capabilities, and cycles each produce a failing bootstrap with a message naming the module.
- [ ] Multiple problems are reported together.
- [ ] Ordering places providers before consumers and is stable across runs.

## Validation

```bash
pnpm --filter @blixis/kernel test
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
- [ ] Semver choice justified; bundle impact noted.

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

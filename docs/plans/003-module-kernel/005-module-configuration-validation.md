# 003.005 — Validate module configuration

## Status

```text
not-started
```

## Parent plan

[003 — Module Kernel](./_index.md)

## Objective

Validate each module's configuration against its `configSchema` (Standard Schema) during bootstrap and pass the typed, validated config to `setup` hooks.

## Background

§26 requires failing clearly on invalid module configuration; §29 lists module configuration as an untrusted boundary; §6 gives each module typed options via its factory. Factories receive raw options; the module declares a schema; the kernel validates before setup.

## Requirements

- During bootstrap, for every module with `configSchema`, validate the config value provided by the factory (convention: module object carries `config` produced by its factory, or factories pass options through — define one convention and document it).
- Aggregate config errors across modules with module names and issue paths.
- Provide validated output (with defaults applied by the schema) as `ctx.config` in `setup`.
- Tests: valid config with defaults; invalid config aggregated error; module without schema receives `undefined` config typed as `unknown`.

## Architectural constraints

- Validation uses the contracts `validate` helper; the kernel does not depend on a specific schema library at runtime.
- Async validation is allowed but must happen during lazy boot if the schema is async (document).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/kernel/src/internal/config.ts
packages/kernel/src/internal/config.test.ts
```

### Modify

```text
packages/kernel/src/internal/lifecycle.ts
packages/contracts/src/module.ts (if the config convention needs a field)
docs/kernel/README.md
```

### Delete

```text
None.
```

## Implementation steps

1. Decide and document the config-passing convention.
2. Implement validation step in the lifecycle.
3. Tests with the ADR 0004 library as devDependency.

## Dependencies

Requires:

- [003.004 — Implement the setup/boot lifecycle and createBlixis](./004-lifecycle-and-create-blixis.md)

## Acceptance criteria

- [ ] Invalid config aborts bootstrap with a `ModuleError` listing module name and issue paths.
- [ ] `ctx.config` is typed as the schema output in a type test.

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
- [ ] Config values are never logged in full (may contain secrets).

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

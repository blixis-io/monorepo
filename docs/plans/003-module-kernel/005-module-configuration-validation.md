# 003.005 — Validate module configuration

## Status

```text
completed
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
packages/kernel/src/create-blixis.ts
packages/contracts/src/module.ts (setup/boot as methods)
packages/contracts/src/module.test-d.ts
apps/docs/src/content/docs/concepts/modules.mdx
docs/ROADMAP.md
docs/plans/003-module-kernel/_index.md
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

- [x] Invalid config aborts bootstrap with a `ModuleError` listing module name and issue paths.
- [x] `ctx.config` is typed as the schema output in a type test.

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
- [x] Config values are never logged in full (may contain secrets).

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

- **Convention** (fixed in 002.002): the factory puts raw options in `module.config`; the kernel validates it with `module.configSchema` via the contracts `validate` helper (any Standard Schema library) and passes the output as `ctx.config`. Absent `config` is validated as `{}` so schema defaults apply; modules without a schema get the raw `config`.
- Validation runs in `ready()` **before any `setup`**, for all modules, and throws one `ModuleValidationError` listing `[module] invalid configuration at config.<path>: <message>` for every issue. Values are never included (test asserts a secret-looking value does not appear). Async schemas are supported because validation happens in the lazy phase.
- **Contract bug found and fixed:** `BlixisModule<SeoConfig>` was not assignable to `BlixisModule<unknown>` (function-typed `setup` property is contravariant under `strictFunctionTypes`), so a `modules` array mixing typed-config modules could not compile. `setup`/`boot` are now **method signatures** (bivariant), like `EventSubscription.handle`; regression type test added in `module.test-d.ts`. `ctx.config` inference inside `defineModule` still works (existing type test).
- Tests (4): outputs with defaults, raw config passthrough, aggregated problems with paths and no leaked values, absent config, end-to-end through `createBlixis`.

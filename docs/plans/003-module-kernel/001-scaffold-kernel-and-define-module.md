# 003.001 — Scaffold @blixis/kernel and implement defineModule

## Status

```text
completed
```

## Parent plan

[003 — Module Kernel](./_index.md)

## Objective

Create the `@blixis/kernel` package and implement `defineModule` supporting both object form and factory form with typed options (§5, §6), returning `BlixisModule` values that satisfy the contracts.

## Background

§5 shows `defineModule({...})`; §6 shows the factory form `defineModule<SeoConfig>((options) => ({...}))` used by external authors; §43 shows consumers calling `auth()`, `content()`. `defineModule` is an identity-like helper that improves inference; it must not register anything globally.

## Requirements

- Create `packages/kernel` per conventions; depend on `@blixis/contracts` and `hono`.
- Implement `defineModule` overloads:
  - `defineModule(module)` → returns a zero-arg factory `() => BlixisModule` so consumers always call `content()` uniformly; and
  - `defineModule<TOptions>((options: TOptions) => module)` → returns `(options?: TOptions) => BlixisModule`.
- Freeze returned module objects (shallow) to discourage mutation.
- Attach a non-enumerable brand so the kernel can detect accidental passing of a factory instead of an instance (clear error: "module X was passed as factory; call it: x()").
- Unit and type tests for both forms.

## Architectural constraints

- No global registries or side effects at import time (§48 Code.6).
- `@blixis/kernel` must not import Cloudflare types or Node built-ins.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/kernel/package.json
packages/kernel/tsconfig.json
packages/kernel/tsconfig.test.json
packages/kernel/src/index.ts
packages/kernel/src/define-module.ts
packages/kernel/src/define-module.test.ts
packages/kernel/src/define-module.test-d.ts
```

### Modify

```text
tsconfig.json
pnpm-lock.yaml
apps/docs/astro.config.mjs (kernel API reference)
apps/docs/src/content/docs/getting-started/introduction.mdx
apps/docs/src/content/docs/concepts/modules.mdx
docs/ROADMAP.md
docs/plans/003-module-kernel/_index.md
```

### Delete

```text
None.
```

## Proposed structure

```text
packages/kernel/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── define-module.ts
    └── internal/          # registry, lifecycle, rest — added by later tasks; not exported
```

## Implementation steps

1. Scaffold package and add dependencies.
2. Implement `defineModule` overloads and brand.
3. Write tests (object form, factory form with options inference, frozen result, brand detection).
4. Build, typecheck, lint.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export function defineModule<TConfig = unknown>(
  module: BlixisModule<TConfig>,
): () => BlixisModule<TConfig>
export function defineModule<TOptions, TConfig = TOptions>(
  factory: (options: TOptions) => BlixisModule<TConfig>,
): (options?: TOptions) => BlixisModule<TConfig>
```

## Dependencies

Requires:

- [002.008 — Define request context and migration contracts](../002-public-contracts/008-define-request-context-and-migration-contracts.md)

## Acceptance criteria

- [x] `const seo = defineModule<{ defaultTitle?: string }>((o) => ({ meta: {...} }))` infers `seo({ defaultTitle: 'x' })` correctly and rejects unknown option keys.
- [x] Object-form modules are invoked as `content()` consistently.
- [x] Only `src/index.ts` exports are reachable.

## Validation

```bash
pnpm --filter @blixis/kernel test
pnpm typecheck && pnpm lint
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
- [x] API matches §5/§6 examples; deviations (always-factory) documented in `docs/kernel/README.md`.

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

- `defineModule` overloads: object form → `ModuleFactory<void, TConfig>` (`() => BlixisModule`, returns the same frozen object each call); factory form → `(options?) => BlixisModule<TConfig>` (fresh frozen module per call, `{}` when called without options). `TConfig` is inferred from `configSchema`, so `ctx.config` in `setup` is typed (type test).
- **Deviation — no brand on factories:** the task suggested a non-enumerable brand to detect `content` passed instead of `content()`. `createBlixis` (003.004) can detect this with `typeof module === 'function'` and raise a clear `ModuleError`, so no brand is needed.
- Dependencies: `@blixis/contracts` (workspace) and `hono` (runtime, for the app kernel builds in 003.006); Zod only as devDependency for type tests.
- Per the definition of done: `@blixis/kernel` added to the generated API reference (second `starlight-typedoc` instance via `createStarlightTypeDocPlugin`; shared TypeDoc options), and the manual's module page now documents `defineModule`.

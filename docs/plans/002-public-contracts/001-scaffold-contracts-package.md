# 002.001 — Scaffold the @blixis/contracts package

## Status

```text
completed
```

## Parent plan

[002 — Public Contracts](./_index.md)

## Objective

Create the `packages/contracts` package following `docs/conventions/packages.md`, with an empty-but-structured source tree, TSDoc conventions, and a type-test mechanism, ready for the contract tasks that follow.

## Background

§4 describes contracts as small and stable. Structuring the source by concern (module, services, errors, events, permissions, context, validation) up front keeps later tasks from dumping everything into one file and makes the public surface reviewable.

## Requirements

- Create `@blixis/contracts` in `packages/contracts` with root-only `exports`, `sideEffects: false`, no runtime dependencies.
- Create source files per concern (initially exporting nothing or placeholders removed before completion): `module.ts`, `services.ts`, `capabilities.ts`, `errors.ts`, `validation.ts`, `events.ts`, `permissions.ts`, `context.ts`, `migrations.ts`, re-exported from `index.ts`.
- Set up a type-test mechanism (e.g. `*.test-d.ts` checked by `tsc`, or Vitest `expectTypeOf`) per ADR 0002, and document it in `docs/conventions/testing.md`.
- Create `docs/contracts/README.md` with the purpose, stability policy, and a table of contents that later tasks fill in.

## Architectural constraints

- No runtime dependencies (§4).
- No Cloudflare, Hono runtime, database, or GraphQL imports.
- Public API only through `src/index.ts`.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/contracts/package.json
packages/contracts/tsconfig.json
packages/contracts/tsconfig.test.json
packages/contracts/src/index.ts
packages/contracts/src/index.test-d.ts
packages/contracts/src/module.ts
packages/contracts/src/services.ts
packages/contracts/src/capabilities.ts
packages/contracts/src/errors.ts
packages/contracts/src/validation.ts
packages/contracts/src/events.ts
packages/contracts/src/permissions.ts
packages/contracts/src/context.ts
packages/contracts/src/migrations.ts
docs/contracts/README.md
```

### Modify

```text
tsconfig.json
pnpm-lock.yaml
docs/ROADMAP.md
docs/plans/002-public-contracts/_index.md
```

### Delete

```text
None.
```

## Proposed structure

```text
packages/contracts/
├── package.json
├── tsconfig.json
└── src/
    ├── index.ts
    ├── module.ts
    ├── services.ts
    ├── capabilities.ts
    ├── errors.ts
    ├── validation.ts
    ├── events.ts
    ├── permissions.ts
    ├── context.ts
    └── migrations.ts
```

## Implementation steps

1. Copy the package shape from `@blixis/shared` and adjust name/description.
2. Create the concern files and re-export them from `index.ts`.
3. Add the type-test mechanism with one trivial passing type test.
4. Add the package to root `tsconfig.json` references.
5. Write `docs/contracts/README.md` skeleton.
6. Run install, typecheck, lint, test, build.

## Dependencies

Requires:

- [001.007 — Set up the continuous integration pipeline](../001-project-foundation/007-setup-ci-pipeline.md)

## Acceptance criteria

- [x] `pnpm build` produces the contracts package output.
- [x] `package.json` has no `dependencies` field (or an empty one).
- [x] A type test runs as part of `pnpm test` or `pnpm typecheck` and passes.
- [x] `pnpm lint` passes including boundary checks.

## Validation

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test && pnpm build
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
- [x] Type-test mechanism is documented and fails on a deliberately wrong assertion.

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

- Concern files start as `export {}` modules re-exported from `src/index.ts` with `export *`; each later task fills its file. `index.ts` uses `export *` only over our own concern files, so the public surface is still controlled file by file (every export must carry TSDoc).
- **Type-test mechanism:** `*.test-d.ts` files use Vitest's `expectTypeOf` and are type-checked by `pnpm typecheck` via `packages/contracts/tsconfig.test.json` (not executed by Vitest; the Node project only matches `*.test.ts`). Verified: changing `toBeObject()` to `toBeString()` fails typecheck with `TS2349`-class errors; restored.
- `tsconfig.test.json` is required from day one because TS 7 errors when a test project has no inputs, so the harness ships with one trivial type test.
- `package.json` has no `dependencies` (the boundary checker's `contracts-runtime-dependency` rule now guards this package).
- `docs/contracts/README.md` defines allowed/forbidden content, the stability policy, and a contents table that later tasks fill in.

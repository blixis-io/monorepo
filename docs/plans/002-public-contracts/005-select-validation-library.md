# 002.005 — Select the validation library and define the schema contract

## Status

```text
completed
```

## Parent plan

[002 — Public Contracts](./_index.md)

## Objective

Choose the default schema validation library for first-party Blixis code (ADR 0004) and expose a library-agnostic schema contract in `@blixis/contracts` based on the Standard Schema specification, plus a helper that converts schema issues into `ValidationError`.

## Background

§29 requires validating all untrusted input at every boundary (REST, GraphQL, module config, queue messages, webhooks, env) with a library that works with TypeScript 7 and Workers, and avoiding duplicated types via inference. Contracts must not force one library on third-party modules, so contracts depend only on the Standard Schema interface; first-party modules standardise on one library for consistency.

## Requirements

- Write ADR 0004 comparing at least Zod (v4), Valibot, and ArkType on: Standard Schema support, Workers compatibility, bundle size, TS7 compatibility (no compiler-API use), inference quality, OpenAPI generation options with Hono, JSON Schema export (useful for content-type field validation and docs).
- Add Standard Schema types to contracts as a type-only dependency (`@standard-schema/spec` as `devDependency` + re-exported types, or vendored type file — decide and document).
- Implement `validate<T>(schema, input): Promise<T>` in contracts that runs `schema['~standard'].validate` and throws `ValidationError` with normalised `ValidationIssue { path: readonly (string|number)[]; message: string; code?: string }` on failure.
- Implement `validateSync` only if the chosen default library supports sync validation reliably; otherwise omit.
- Tests using the chosen library as a devDependency only (contracts must not depend on it at runtime).

## Architectural constraints

- Contracts keep zero runtime dependencies; the chosen library is a dependency of packages/modules that use it, not of contracts.
- Validation helpers must be Web-platform only.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0004-validation-library.md
packages/contracts/src/standard-schema.ts
packages/contracts/src/validation.test.ts
packages/contracts/src/validation.test-d.ts
```

### Modify

```text
packages/contracts/src/validation.ts
packages/contracts/package.json (zod as devDependency only)
pnpm-workspace.yaml (catalog: zod 4.6.5)
pnpm-lock.yaml
docs/contracts/README.md
docs/decisions/README.md
docs/conventions/code-standards.md
docs/ROADMAP.md
docs/plans/002-public-contracts/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Evaluate candidates (spike outside the repo if needed) and write ADR 0004.
2. Add Standard Schema types to contracts.
3. Implement `validate` and issue normalisation.
4. Add tests using the chosen library as devDependency.
5. Update docs with guidance: "first-party code uses <library>; external modules may use any Standard Schema library".

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export type { StandardSchemaV1 } from './standard-schema'
export interface ValidationIssue {
  readonly path: readonly (string | number)[]
  readonly message: string
  readonly code?: string
}
export function validate<S extends StandardSchemaV1>(
  schema: S,
  input: unknown,
): Promise<StandardSchemaV1.InferOutput<S>>
```

## Dependencies

Requires:

- [002.004 — Define the public error model](./004-define-public-errors.md)

## Acceptance criteria

- [x] ADR 0004 accepted with the evaluation criteria filled in.
- [x] `validate` returns the typed output for valid input and throws `ValidationError` with normalised paths for invalid input.
- [x] `packages/contracts/package.json` still has no runtime `dependencies`.

## Validation

```bash
pnpm --filter @blixis/contracts test
pnpm build && node -e "import('@blixis/contracts')"   # or equivalent resolution check from a workspace consumer
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
- [x] Library choice verified in the Workers runtime (record the check in Technical notes).

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

- **Zod 4.6.5** chosen by the project owner; ADR 0004 records the comparison (Valibot 1.5.0, ArkType 2.2.3) and spike results.
- **Spike (Workers test pool):** Zod `parse`/`safeParse` and `~standard.validate` work in `workerd`. The Vitest Workers pool **allows `new Function`**, while production Workers forbid code generation — so tests cannot prove eval-free behaviour. Decision: Worker entry points call `z.config({ jitless: true })`; the contracts tests do the same.
- **Bundle sizes** (minimal Worker, Wrangler dry-run): full `zod` 769 KiB raw / 119 KiB gzip; `zod/mini` 28 KiB / 7 KiB. Full Zod is the default; `zod/mini` is the escape hatch if bundle budgets (004.006) get tight.
- **Standard Schema types vendored** in `src/standard-schema.ts` (spec v1, ~60 lines, as recommended by the spec) so contracts keep zero dependencies; Zod is only a devDependency for tests. Verified: no `zod` reference in `packages/contracts/dist`, no `dependencies` field.
- `validate` (async) and `validateSync` (throws `TypeError` for async schemas) throw `ValidationError`; `toValidationIssues` normalises path segments (`{ key }` objects, numbers, symbols → strings) and keeps string `code`s (Zod provides e.g. `too_small`).
- Also exported: `InferOutput`, `InferInput`, `ValidateOptions`. Type tests confirm Zod schemas satisfy the vendored interface and `validate` infers outputs (including defaults).
- `declare namespace` in the vendored file did not need a Biome suppression (initial suppression was reported as unused and removed).

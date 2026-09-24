# 002.005 — Select the validation library and define the schema contract

## Status

```text
not-started
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
packages/contracts/src/validation.test.ts
```

### Modify

```text
packages/contracts/src/validation.ts
packages/contracts/src/errors.ts
packages/contracts/src/index.ts
packages/contracts/package.json
docs/contracts/README.md
pnpm-lock.yaml
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

- [ ] ADR 0004 accepted with the evaluation criteria filled in.
- [ ] `validate` returns the typed output for valid input and throws `ValidationError` with normalised paths for invalid input.
- [ ] `packages/contracts/package.json` still has no runtime `dependencies`.

## Validation

```bash
pnpm test --filter @blixis/contracts
pnpm build && node -e "import('@blixis/contracts')"   # or equivalent resolution check from a workspace consumer
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
- [ ] Library choice verified in the Workers runtime (record the check in Technical notes).

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

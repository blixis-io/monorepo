# 002.004 — Define the public error model

## Status

```text
completed
```

## Parent plan

[002 — Public Contracts](./_index.md)

## Objective

Implement the transport-agnostic public error hierarchy from §28 with stable error codes, safe serialisation, and optional structured details (e.g. validation issues).

## Background

§28 requires public application errors that transports map to their protocols (REST → HTTP status, GraphQL → extension code). Domain services must never throw Hono HTTP exceptions. Defining the classes in contracts lets external modules throw the same errors first-party modules do.

## Requirements

- Implement a base `BlixisError` (extends `Error`) with `code` (stable string), `message`, optional `details` (JSON-serialisable), optional `cause`, and `expose` flag (whether the message is safe to show to clients).
- Implement: `ValidationError` (with `issues: readonly ValidationIssue[]`), `NotFoundError`, `ConflictError`, `ForbiddenError`, `UnauthorizedError`, `RateLimitError` (optional `retryAfterSeconds`), `ModuleError` (with `moduleName`), `InfrastructureError` (never exposes internal message).
- Define `ErrorCode` union: `VALIDATION_FAILED`, `NOT_FOUND`, `CONFLICT`, `FORBIDDEN`, `UNAUTHORIZED`, `RATE_LIMITED`, `MODULE_ERROR`, `INFRASTRUCTURE_ERROR`, `INTERNAL`.
- Implement `isBlixisError(value): value is BlixisError` that works across duplicated package instances (brand check via `Symbol.for`, not `instanceof` only).
- Implement `toPublicErrorShape(error)` returning `{ code, message, details? }` with internal messages redacted for non-exposed errors.
- Document the transport mapping table (REST status / GraphQL code) in `docs/contracts/errors.md` — the mapping itself is implemented in plans 003 and 012.
- Unit tests for every class, brand check across a simulated second instance, and redaction.

## Architectural constraints

- No HTTP status codes inside error classes (transport concern, §28). The mapping table lives in docs and transport packages.
- Never include stack traces or `cause` in the public shape.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/contracts/src/errors.test.ts
docs/contracts/errors.md
```

### Modify

```text
packages/contracts/src/errors.ts
docs/contracts/README.md
docs/ROADMAP.md
docs/plans/002-public-contracts/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Implement the base class with brand symbol.
2. Implement subclasses and `ErrorCode`.
3. Implement `isBlixisError` and `toPublicErrorShape`.
4. Write tests including a brand check against an object created by a "second copy" of the class.
5. Write `docs/contracts/errors.md` with the mapping table.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
export type ErrorCode =
  | 'VALIDATION_FAILED' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN'
  | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'MODULE_ERROR'
  | 'INFRASTRUCTURE_ERROR' | 'INTERNAL'

export interface PublicErrorShape {
  readonly code: ErrorCode
  readonly message: string
  readonly details?: unknown
}
```

## Dependencies

Requires:

- [002.001 — Scaffold the @blixis/contracts package](./001-scaffold-contracts-package.md)

## Acceptance criteria

- [x] Every error class listed in §28 exists and carries the right `code`.
- [x] `toPublicErrorShape(new InfrastructureError('db password wrong'))` does not contain the original message.
- [x] `isBlixisError` returns true for a branded error from a separate module instance and false for plain `Error`.
- [x] `docs/contracts/errors.md` contains the REST status and GraphQL code for every error code.

## Validation

```bash
pnpm --filter @blixis/contracts test
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
- [x] No secrets can leak through `details` for infrastructure errors (details dropped when `expose` is false).

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

- Classes: abstract `BlixisError` (brand, `code`, `expose`, optional `details`, native `cause`) and `ValidationError` (with `issues`), `NotFoundError`, `ConflictError`, `ForbiddenError`, `UnauthorizedError`, `RateLimitError` (`retryAfterSeconds`), `ModuleError` (`moduleName`, message prefixed `[module]`, not exposed), `InfrastructureError` (`retryable`, not exposed). `ErrorCode` also includes `INTERNAL` for unknown errors.
- `ValidationIssue` lives in `errors.ts` (needed by `ValidationError`); the validation helper in 002.005 reuses it.
- **Brand:** `Symbol.for('@blixis/contracts.error')` as a computed class field; `isBlixisError` checks it, so errors from a second package copy are recognised (tested with a foreign class). Declaration emit keeps a non-exported `declare const BRAND: unique symbol`.
- **Gotcha:** with ES2022 class fields (`useDefineForClassFields`), an optional field without initializer (`readonly details?: unknown`) still defines the property as `undefined`. Optional fields use `declare readonly …` so the property is absent unless set (tested: `new NotFoundError('x')` has no `details` property).
- `toPublicErrorShape` redacts non-exposed and unknown errors to generic messages per code and never includes `cause`/stack; tested that a DB password message and details do not leak.
- `docs/contracts/errors.md` holds the REST status / GraphQL code table: `InfrastructureError` maps to 503 when `retryable`, else 500 (refinement of the task's table); GraphQL alias for validation decided in 012.003.

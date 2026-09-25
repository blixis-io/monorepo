# 012.003 — Map Blixis errors to GraphQL errors

## Status

```text
completed
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Implement error mapping so resolvers throwing `BlixisError`s produce GraphQL errors with `extensions.code` and safe messages, and unexpected errors are masked, with request IDs in extensions.

## Background

§28 example: `NotFoundError` → `NOT_FOUND` extension code. Transports own the mapping; services remain transport-agnostic.

## Requirements

- Yoga `maskedErrors` customisation: `BlixisError` → `{ message (if exposed), extensions: { code, requestId, details? } }`; `ValidationError` includes issues; others → `INTERNAL`.
- Log unexpected errors with request context fields.
- Tests for each code.
- Update `docs/contracts/errors.md` GraphQL column if refined.

## Architectural constraints

- Never include stack traces in responses.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/graphql/src/errors.ts
packages/graphql/src/errors.test.ts
```

### Modify

```text
packages/graphql/src/module.ts
packages/graphql/src/index.ts
packages/kernel/src/error-reporter.ts (ERROR_REPORTER token)
packages/kernel/src/create-blixis.ts
packages/kernel/src/index.ts
apps/docs/src/content/docs/concepts/errors.mdx (GraphQL section; docs/contracts/errors.md points here)
```

### Delete

```text
None.
```

## Implementation steps

1. Implement mapping.
2. Tests.

## Dependencies

Requires:

- [012.002 — Compose and validate the schema from module contributions](./002-schema-composition-and-scalars.md)

## Acceptance criteria

- [x] A resolver throwing `NotFoundError` yields `extensions.code = "NOT_FOUND"`.
- [x] An unexpected `Error('secret')` yields a masked message.

## Validation

```bash
pnpm --filter @blixis/graphql test
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
- [x] Mapping table consistent with REST.

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

- **`useBlixisErrors()`** (Yoga plugin, `onExecuteDone`) maps every execution error with `mapGraphQLError`:
  - **Public `BlixisError`s** keep their message, with `extensions.code` (`MODULE_ERROR` → `INTERNAL`). `ValidationError`s add `extensions.issues`.
  - **`InfrastructureError`** follows the documented contract: code `INFRASTRUCTURE_ERROR` with `retryable`, and the hidden message `A dependency is unavailable`.
  - **Non-exposed errors and anything else** become `Unexpected error` / `INTERNAL`.
  - **GraphQL parse and validation errors,** and `GraphQLError`s thrown on purpose, keep their message.
  - Every error gets `extensions.requestId`.
- **Unexpected errors** are logged (`graphql resolver failed`, with path and original error) and reported through the new optional kernel service **`ERROR_REPORTER`**. The kernel provides it whenever `createBlixis({ errorReporter })` is set, as the Sentry reporter in the API Worker is. Reports carry request id, correlation id, actor type, space and `route: '/graphql'`, the same as REST 5xx.
- Yoga's `maskedErrors` stays enabled as a last line of defence. Errors that `useBlixisErrors` already mapped have no `originalError`, so they pass through unchanged.
- **Tests** cover all 9 error kinds in one query (codes, messages, issues, request ids, no leaked internals), reporting of exactly the 3 unexpected errors with context, logs, and GraphQL validation errors.
- **Manual:** *Concepts → Errors* has a *What clients receive (GraphQL)* section, and the table notes `retryable`.

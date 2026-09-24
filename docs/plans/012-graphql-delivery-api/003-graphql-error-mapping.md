# 012.003 — Map Blixis errors to GraphQL errors

## Status

```text
not-started
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
packages/graphql/src/server.ts
docs/contracts/errors.md
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

- [ ] A resolver throwing `NotFoundError` yields `extensions.code = "NOT_FOUND"`.
- [ ] An unexpected `Error('secret')` yields a masked message.

## Validation

```bash
pnpm --filter @blixis/graphql test
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
- [ ] Mapping table consistent with REST.

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

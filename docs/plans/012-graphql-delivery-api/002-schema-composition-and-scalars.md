# 012.002 — Compose and validate the schema from module contributions

## Status

```text
not-started
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Compose all modules' GraphQL contributions (collected by the kernel in 003.007) into one executable schema with shared scalars, detect conflicts, and fail bootstrap with module-attributed errors.

## Background

§10 kernel/GraphQL package composes contributions; §26 conflicting GraphQL definitions must fail clearly.

## Requirements

- Parse each module's `typeDefs`; merge `extend type Query` fragments; detect duplicate type names, duplicate fields on extended types, and resolvers without schema fields (and vice versa) — naming modules.
- Shared scalars: `DateTime`, `JSON`, `Locale` (validated BCP 47) and `ID` conventions; exported for module authors.
- Compose once per isolate (app scope) for static contributions; design extension point for dynamic per-space schema (ADR 0011).
- Tests with fixture modules (valid merge, type conflict, field conflict, orphan resolver).

## Architectural constraints

- Composition must not require a build step (no codegen) in MVP.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/graphql/src/compose.ts
packages/graphql/src/scalars.ts
packages/graphql/src/compose.test.ts
```

### Modify

```text
packages/graphql/src/module.ts
packages/graphql/src/index.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Implement parsing/merging.
2. Conflict detection with attribution.
3. Scalars.
4. Tests.

## Dependencies

Requires:

- [012.001 — Scaffold @blixis/graphql with GraphQL Yoga on Workers](./001-scaffold-graphql-package-with-yoga.md)

## Acceptance criteria

- [ ] Two fixture modules defining `type Entry` fail bootstrap naming both.
- [ ] Orphan resolvers are reported.

## Validation

```bash
pnpm test --filter @blixis/graphql
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
- [ ] Error messages match §26 style.

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

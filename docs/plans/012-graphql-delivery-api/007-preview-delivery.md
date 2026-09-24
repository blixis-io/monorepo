# 012.007 — Implement preview (draft) delivery

## Status

```text
not-started
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Allow preview keys (and authorised users) to query draft content through the same schema via a `preview: true` argument or preview-key-implied mode, with strict cache-control semantics.

## Background

§22 draft content when authorised; §34 draft/preview endpoints need stricter cache rules.

## Requirements

- Preview mode determined by actor (preview key or user with `content.preview.read`) — delivery keys requesting preview get `FORBIDDEN`.
- Resolvers pass `state: 'draft'` to `ContentService` in preview mode; link resolution uses drafts consistently.
- Response header `Cache-Control: private, no-store` in preview mode (plan 013 handles public caching).
- Tests for mixed-state link resolution and forbidden cases.

## Architectural constraints

- Preview responses must never be cacheable publicly.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/api/test/preview.worker.test.ts
```

### Modify

```text
modules/content/src/graphql/resolvers.ts
modules/content/src/graphql/schema.ts
packages/graphql/src/context.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Mode detection in context.
2. Resolver state propagation.
3. Headers and tests.

## Dependencies

Requires:

- [012.006 — Implement content delivery schema and resolvers](./006-content-delivery-schema-and-resolvers.md)

## Acceptance criteria

- [ ] Preview key sees draft changes; delivery key does not.
- [ ] Preview responses carry `no-store`.

## Validation

```bash
pnpm --filter @blixis/api test
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
- [ ] No draft leakage path through link resolution.

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

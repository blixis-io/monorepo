# 012.007 — Implement preview (draft) delivery

## Status

```text
completed
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
modules/content/test/preview.graphql.test.ts
```

### Modify

```text
packages/graphql/src/context.ts (responseHeaders)
packages/graphql/src/module.ts
modules/content/src/graphql/delivery.ts
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

- [x] Preview key sees draft changes; delivery key does not.
- [x] Preview responses carry `no-store`.

## Validation

```bash
pnpm --filter @blixis/api test
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
- [x] No draft leakage path through link resolution.

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

- **Preview mode:** preview is chosen per root field with `preview: true` (ADR 0011 §6), as implemented in 012.006.
  - `DELIVERY_SERVICE.requireState` demands `content.preview.read`. Preview keys and members (admin, editor, viewer by default) have it; delivery keys get `FORBIDDEN`, and the field is `null`.
  - Link resolution uses the parent's state throughout, because the per-request batch loaders are keyed by state.
- **`Cache-Control: private, no-store`** is set on every response that read drafts. This uses a new generic **`GraphQLContext.responseHeaders`**: resolvers set response headers, and the `/graphql` route copies them onto Yoga's response. Plan 013 uses the same mechanism for public caching.
- **Tests** (a published post with a newer draft, linking to an author with a newer draft and to a never-published editor):
  - published reads show the live author and drop the unpublished editor;
  - preview reads show drafts all the way down;
  - the header is present only for drafts;
  - a delivery key gets `FORBIDDEN`, and a member previews with `?space=`.

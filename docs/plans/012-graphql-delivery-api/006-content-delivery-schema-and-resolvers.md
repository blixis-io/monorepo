# 012.006 — Implement content delivery schema and resolvers

## Status

```text
not-started
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Implement the delivery GraphQL schema per ADR 0011 in `@blixis/content` (`src/graphql/`) with resolvers calling `ContentService` in `published` state, locale selection with fallback, link resolution, and collections with pagination/filtering.

## Background

§10 module-contributed GraphQL; §22 published content publicly; 011.006 link resolution helper.

## Requirements

- `modules/content/src/graphql/schema.ts` and `resolvers.ts` (+ generator if ADR chooses typed schemas).
- Queries: single entry by ID, collections by content type with `limit`, `cursor`/`skip`, `where` (MVP filters per ADR 0010), `order`, `locale` argument with fallback chain.
- Link fields resolved through batched loaders (`resolveLinks`).
- Tenant from delivery key actor (space/environment); requests without delivery/preview key → `UNAUTHORIZED` unless public delivery is enabled for a space (decide: not in MVP).
- Permission checks via service (`content.delivery.read`).
- Workers-pool tests with a sample content model.

## Architectural constraints

- No business logic in resolvers (§48 Code.9).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/src/graphql/schema.ts
modules/content/src/graphql/resolvers.ts
modules/content/src/graphql/generate.ts (if ADR 0011 chooses generated types)
modules/content/src/graphql/loaders.ts
modules/content/test/graphql.test.ts
apps/api/test/delivery.worker.test.ts
```

### Modify

```text
modules/content/src/module.ts
modules/content/src/application/content.service.ts
modules/content/package.json
packages/graphql/src/server.ts (dynamic schema hook, if ADR requires)
```

### Delete

```text
None.
```

## Implementation steps

1. Implement schema (static or generated).
2. Implement resolvers and loaders.
3. Locale fallback.
4. Tests.

## Dependencies

Requires:

- [012.005 — Decide the delivery schema strategy](./005-decide-delivery-schema-strategy.md)

## Acceptance criteria

- [ ] Published entries queryable with delivery key; drafts never returned.
- [ ] Locale fallback follows space fallback chain.
- [ ] Nested links resolved with bounded query counts.

## Validation

```bash
pnpm test --filter @blixis/content
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
- [ ] Resolvers only call services.

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

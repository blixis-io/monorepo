# 012.005 — Decide the delivery schema strategy

## Status

```text
not-started
```

## Parent plan

[012 — GraphQL Platform & Content Delivery API](./_index.md)

## Objective

Record ADR 0011 deciding whether the delivery GraphQL schema is generic, generated per space/environment from content types, or both — including naming rules, caching of generated schemas, and invalidation on content-type changes.

## Background

§10 shows static module-contributed typeDefs. A headless CMS usually generates typed schemas from user-defined content models, which is dynamic per tenant; Yoga supports per-request schema selection. This decision drives 012.006 and caching (013).

## Requirements

- Evaluate: (a) generic schema only; (b) generated typed schema per `(space, environment, contentModelVersion)`; (c) both.
- For (b)/(c): type/field naming from `apiId` (collision rules, reserved names), mapping from field types' `graphql` metadata (010.003), locale arguments, link fields, collections with pagination/filter/order arguments, schema build cost measurement in `workerd`, cache location (isolate memory LRU keyed by content-model version; KV not required), invalidation via `content-type.*` events or version check per request.
- Decide how static module contributions merge with generated types.
- Decide pagination style (cursor vs. skip/limit) and max page size.

## Architectural constraints

- Must keep resolvers thin over `ContentService` (§10).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0011-delivery-graphql-schema.md
```

### Modify

```text
None.
```

### Delete

```text
None.
```

## Implementation steps

1. Prototype schema generation for a sample content model and measure build time.
2. Write ADR 0011 with examples of generated SDL.

## Dependencies

Requires:

- [012.004 — Implement delivery and preview API keys](./004-delivery-and-preview-api-keys.md)

## Acceptance criteria

- [ ] ADR 0011 accepted with sample SDL, naming rules, cache and invalidation strategy.

## Validation

- Review against §10, §22, §34.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Decision documented in ROADMAP open-decisions table as resolved.

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

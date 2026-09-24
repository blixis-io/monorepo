# 022.003 — Publish documentation and API reference

## Status

```text
not-started
```

## Parent plan

[022 — Production Readiness & Launch](./_index.md)

## Objective

Produce a documentation index and consumer-facing docs: Management API reference from OpenAPI, delivery (GraphQL) guide, SDK guide, webhooks guide, module authoring links, and operator runbooks index.

## Background

017.001 OpenAPI; existing docs across `docs/api`, `docs/operations`, `docs/extensions`.

## Requirements

- `docs/README.md` index linking architecture, roadmap, conventions, decisions, API, SDK, extensions, operations, security.
- Render API reference from `docs/api/openapi.json` (static HTML via a tool, or served by the Worker in non-production) — decide.
- Review every doc for accuracy against implementation.
- Quick-start guide: from zero to a published entry consumed by the example site.

## Architectural constraints

- Docs must not include secrets or internal hostnames.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/README.md
docs/getting-started.md
docs/sdk/README.md (if not created in 017)
```

### Modify

```text
docs/api/delivery.md
docs/api/webhooks.md
docs/api/management-conventions.md
README.md
```

### Delete

```text
None.
```

## Implementation steps

1. Index.
2. API reference rendering.
3. Accuracy review.
4. Quick-start.

## Dependencies

Requires:

- [022.001 — Define performance targets and run load tests](./001-performance-and-load-testing.md)

## Acceptance criteria

- [ ] Quick-start followed by someone unfamiliar succeeds (or by an agent in a clean environment).
- [ ] All doc links valid (link checker).

## Validation

```bash
npx markdown-link-check docs/**/*.md   # or equivalent link checker
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
- [ ] Docs reflect deferred items honestly (no aspirational features).

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

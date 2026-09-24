# 023.003 — Write the developer manual for module authors

## Status

```text
not-started
```

## Parent plan

[023 — Developer Documentation Site](./_index.md)

## Objective

Write the hand-written manual: introduction, installation, "Your first module" walkthrough, and one concept page per contract area (modules, services & capabilities, errors, validation, events, permissions & actors, request context & migrations), moving the content of `docs/contracts/*.md` into the site.

## Background

`docs/contracts/README.md`, `errors.md`, and `events.md` hold the current contract documentation. The manual turns this into a guided path for module authors and links each concept to the generated reference.

## Requirements

- Pages: `getting-started/introduction`, `getting-started/first-module`, `concepts/modules`, `concepts/services-and-capabilities`, `concepts/errors`, `concepts/validation`, `concepts/events`, `concepts/permissions`, `concepts/context-and-migrations`.
- Every code sample compiles against the current contracts (mirrors the type tests; no aspirational APIs). APIs from later plans (kernel `createBlixis`, `defineModule`) are marked "coming in plan 003".
- Replace `docs/contracts/*.md` bodies with short pointers to the site pages (keep the files so existing links work) — or keep them as the source for the site if duplication is avoided; decide and document.
- Add the documentation rule to the definition of done (ROADMAP, PR template, package conventions).

## Architectural constraints

- No content that contradicts `BLIXIS_ARCHITECTURE.md`; link to it for rationale.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/docs/src/content/docs/getting-started/introduction.mdx
apps/docs/src/content/docs/getting-started/first-module.mdx
apps/docs/src/content/docs/concepts/modules.mdx
apps/docs/src/content/docs/concepts/services-and-capabilities.mdx
apps/docs/src/content/docs/concepts/errors.mdx
apps/docs/src/content/docs/concepts/validation.mdx
apps/docs/src/content/docs/concepts/events.mdx
apps/docs/src/content/docs/concepts/permissions.mdx
apps/docs/src/content/docs/concepts/context-and-migrations.mdx
```

### Modify

```text
docs/contracts/README.md
docs/contracts/errors.md
docs/contracts/events.md
docs/ROADMAP.md
.github/pull_request_template.md
docs/conventions/packages.md
```

### Delete

```text
None.
```

## Implementation steps

1. Write the pages from the existing contract docs and type tests.
2. Cross-link concepts ↔ reference.
3. Reduce `docs/contracts/*` to pointers; update link targets.
4. Add the documentation rule to the definition of done.

## Dependencies

Requires:

- [023.002 — Generate the API reference from TSDoc](./002-generate-api-reference.md)

## Acceptance criteria

- [ ] All listed pages exist, render, and link to the reference.
- [ ] Code samples match exported APIs (checked by a reviewer against the type tests).
- [ ] Definition of done mentions the manual.

## Validation

```bash
pnpm --filter @blixis/docs build
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
- [ ] Samples compile in spirit against contracts; nothing aspirational.

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

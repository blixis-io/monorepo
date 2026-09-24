# 019.004 — Implement the entry list and editor with publishing

## Status

```text
not-started
```

## Parent plan

[019 — Admin UI Foundation](./_index.md)

## Objective

Build the entry list (filter by content type, pagination) and the entry editor (field widgets per type, locale tabs, draft save with optimistic concurrency, publish/unpublish, version history and restore, reference and asset pickers with upload).

## Background

011 entries/publishing API; 014 assets API; ADR 0010 rich text format.

## Requirements

- Entry list with filters and cursor pagination.
- Editor widgets per field type; rich text editor consistent with ADR 0010 (decide library; record).
- Locale tabs honoring localized flags.
- Save draft with `expectedVersion`; handle `CONFLICT` (reload/merge prompt).
- Publish/unpublish with validation error display at field paths.
- Versions sidebar with restore.
- Reference picker (entries) and asset picker with upload.
- Playwright smoke: full editorial flow.

## Architectural constraints

- Do not autosave more often than a documented interval (version growth, 011 question).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/admin/src/routes/entries/index.tsx
apps/admin/src/routes/entries/$entryId.tsx
apps/admin/src/features/entries/
apps/admin/src/features/assets/asset-picker.tsx
apps/admin/test/entries.test.tsx
apps/admin/e2e/editorial-flow.spec.ts
```

### Modify

```text
apps/admin/src/routes/_app.tsx
apps/admin/package.json
.github/workflows/ci.yml (admin e2e job)
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. List view.
2. Editor and widgets.
3. Publishing and versions.
4. Pickers.
5. E2E smoke in CI.

## Dependencies

Requires:

- [019.003 — Implement the content type editor](./003-content-type-editor.md)

## Acceptance criteria

- [ ] Editorial flow E2E passes in CI.
- [ ] Validation errors appear next to the right field/locale.

## Validation

```bash
pnpm --filter @blixis/admin e2e
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
- [ ] Accessibility baseline (axe) run on editor screens; results recorded.

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

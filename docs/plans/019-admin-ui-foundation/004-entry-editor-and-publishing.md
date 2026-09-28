# 019.004 — Implement the entry list and editor with publishing

## Status

```text
completed
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
apps/admin/src/routes/entries.tsx (list)
apps/admin/src/routes/entry.tsx (routes, loaders) and entry.lazy.tsx (code-split pages)
apps/admin/src/features/entries/{entry-editor.tsx,fields-form.tsx,entry-picker-dialog.tsx,status-badge.tsx,queries.ts,values.ts,values.test.ts}
apps/admin/src/features/entries/widgets/{types.ts,simple.tsx,links.tsx,blocks.tsx,rich-text.tsx}
apps/admin/src/features/assets/asset-picker.tsx
apps/admin/test/{entries.test.tsx,entries-list.test.tsx,entry-fixtures.tsx,fake-content.ts}
apps/admin/e2e/editorial-flow.spec.ts
```

### Modify

```text
apps/admin/src/routes/{router.tsx,space.tsx (Entries tab),content-type.tsx}
apps/admin/src/features/content-types/{draft.ts,field-card.tsx} (new fields' API ID follows the name)
apps/admin/src/styles.css (rich-text content styles)
apps/admin/test/fake-api.ts (locales, content fake)
apps/admin/package.json (Tiptap), pnpm-lock.yaml
apps/admin/README.md
packages/sdk/src/client.ts (entries.restore)
apps/docs/src/content/docs/getting-started/sdk.mdx
docs/decisions/0017-admin-stack.md (rich-text addendum)
.github/workflows/ci.yml (e2e job)
docs/ROADMAP.md, docs/plans/019-admin-ui-foundation/_index.md
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

- [x] Editorial flow E2E passes in CI.
- [x] Validation errors appear next to the right field/locale.

## Validation

```bash
pnpm --filter @blixis/admin e2e
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
- [x] Accessibility baseline (axe) run on editor screens; results recorded.

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

- **Rich text: Tiptap 3.31** (MIT), recorded in the ADR 0017 addendum. Node and mark names match ADR 0010 one-to-one (`heading`, `bulletList`, `table`/`tableRow`/`tableHeader`/`tableCell`, `bold`, `link`, …); `embeddedEntry`/`embeddedAsset` are custom atom nodes with `attrs.id`. StarterKit and the table extension are configured from the field's settings, so disallowed nodes, marks, and heading levels can't be created or pasted. Links accept the server's href rule (`http(s)`, `mailto:`, `tel:`, relative). Loaded lazily: 455 kB (143 kB gzip) only when a rich-text field shows.
- **No autosave** (the plan's constraint): saves are explicit (button, ⌘/Ctrl+S); leaving with unsaved changes asks first.
- **Concurrency:** saves and publishes send `If-Match`; a stale version shows "Load the latest version". "Publish" saves pending changes first, then publishes that version.
- **Errors at field and locale:** `groupIssues` maps `fields.<apiId>.<locale>.…` to the field row for that locale; locale tabs show a count, and the editor switches to the first locale with a problem. Nested block issues show on the blocks field with their path.
- **Pickers:** entries by allowed content type (display field as title, status badge); assets filtered by the field's MIME patterns, with upload (single request ≤ 64 MiB, multipart above) and "Publish after upload" (default on, since publishing an entry needs its assets published).
- **Blocks:** `_type` is the component's apiId; component fields are never localized; nested blocks render through `WidgetContext.renderFields` (avoids an import cycle).
- **Content type editor tweak:** a new field's API ID now follows its name until the API ID is edited (found by the e2e flow: renaming "Text" to "Title" kept `text`).
- **Bundle:** entry pages are a lazy route (`entry.lazy.tsx`, 32 kB); Tiptap is a lazy chunk. The main chunk stays ~213 kB gzip.
- **Tests:** 6 value unit tests; 8 component tests (create with locales, publish errors per locale, conflict, restore, reference/asset/upload/blocks, unpublish with force, rich-text toolbar from settings, list and new-entry menu) against a fake API with entries, versions, publishing, and assets. jsdom quirks: Node's `fetch` needs Node's `File` for uploads; a Radix dropdown opened in one test keeps the next test's dropdowns from opening, so the list test has its own file (browsers are fine: the e2e flow opens menus right after dialogs).
- **E2E in CI:** new `e2e (admin)` job: Postgres service, `pnpm build`, `pnpm db:migrate`, a throwaway `AUTH_SIGNING_KEYS` in `apps/api/.dev.vars`, Playwright Chromium, all admin e2e specs. The editorial flow: build a model (component, type with required title, rich text, asset, blocks), publish fails next to the title, fill rich text (bold), upload an image, add a block, save, publish, edit and publish, restore version 1, unpublish, reload (rich text, block, asset kept), list.
- **New dependencies:** `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-table` 3.31.3 (MIT; ProseMirror underneath).

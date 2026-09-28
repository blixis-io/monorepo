# 019.003 — Implement the content type editor

## Status

```text
completed
```

## Parent plan

[019 — Admin UI Foundation](./_index.md)

## Objective

Build screens to list, create, and edit content types and fields, including field settings per built-in field type and safe-change error handling.

## Background

010 content types API and field types.

## Requirements

- List content types; create/edit with fields (add, reorder, configure settings, localized flag, required, validations); delete with confirmation.
- Field settings forms generated from a UI registry mirroring the built-in types (UI-only mapping; server validates).
- Surface `CONFLICT` errors from unsafe changes with guidance.
- Component tests.

## Architectural constraints

- No duplicated validation logic beyond UX hints; server is authoritative.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/admin/src/routes/content-types.tsx (list)
apps/admin/src/routes/content-type.tsx (editor)
apps/admin/src/features/content-types/{draft.ts,draft.test.ts,queries.ts,ui-registry.ts,settings-form.tsx,field-card.tsx,add-field-dialog.tsx,create-content-type-dialog.tsx,delete-content-type-dialog.tsx}
apps/admin/src/components/ui/{native-select,checkbox,textarea}.tsx
apps/admin/test/content-types.test.tsx
apps/admin/test/fixtures/field-types.json
apps/admin/e2e/content-types.spec.ts
apps/admin/e2e/helpers.ts
modules/content/test/admin-fixture.test.ts
```

### Modify

```text
apps/admin/src/routes/space.tsx (space layout with tabs; overview as child route)
apps/admin/src/routes/router.tsx
apps/admin/src/routes/home.tsx (organization cards are named regions)
apps/admin/test/fake-api.ts
apps/admin/e2e/sign-in.spec.ts
apps/admin/README.md
packages/sdk/src/client.ts (fieldTypes.list)
apps/docs/src/content/docs/extending/custom-field-types.mdx (the admin section)
biome.json (fixture excluded)
docs/ROADMAP.md, docs/plans/019-admin-ui-foundation/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. List and detail routes.
2. Field editor components.
3. Error handling and tests.

## Dependencies

Requires:

- [019.002 — Implement admin authentication and navigation shell](./002-admin-auth-and-shell.md)

## Acceptance criteria

- [x] Editor can create a content type with every built-in field type.

## Validation

```bash
pnpm --filter @blixis/admin test
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
- [x] Unsafe change errors are understandable.

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

- **Settings forms from JSON Schema:** `GET /api/v1/field-types` returns each type's settings schema (`z.toJSONSchema`, input side); `settings-form.tsx` renders booleans, numbers, enums, strings (dates), enum and small integer arrays (checkboxes), string arrays (comma list), object arrays (rows), and a JSON editor for anything else. `ui-registry.ts` adds icons, labels, hints, and content type/component pickers for the 13 built-in types; plugin types work without admin changes and may label settings with `.meta({ title })` and `.describe()`. Unset settings stay unset so server defaults apply.
- **Server authoritative:** the admin only hints (e.g. no localized toggle for non-localizable types, display field limited to text types, conditions only on non-localized boolean/select fields). Validation issues map to their field by path (`fields.N…`); `CONFLICT` answers get guidance: stale version → "Load the latest version"; unsafe change → the server's list plus how to disable a field before removing it.
- **State:** a plain working copy (`draft.ts`) instead of TanStack Form: the field list is dynamic and each type has its own schema-driven settings. The create dialog uses TanStack Form. The editor remounts on each new version, so after a save the working copy is the server's answer.
- **Unsaved changes:** `useBlocker` with a confirmation dialog, plus the browser's `beforeunload` prompt.
- **Accessibility:** each field is a list item with a disclosure button (`aria-expanded`); move/remove buttons are labelled per field; field type buttons are labelled by name and described by their description; settings groups are fieldsets with legends.
- **Tests:** 6 draft unit tests; 7 component tests with a fake API (list/create; all 13 built-in types with generated settings; validation on the field; unsafe and stale conflicts; reorder/remove; leave guard; delete). The fake uses `test/fixtures/field-types.json`, checked against the real registry by `modules/content/test/admin-fixture.test.ts`. The Playwright test creates a content type with all 13 built-in types against the real local API (server validation passes, the fields survive a reload).
- **Bundle:** 698 kB (211 kB gzip). Route-level code splitting comes with 019.004, whose rich-text editor adds the most weight.
- **Layout change:** the space page is now a layout (breadcrumb, name, tabs: Overview, Content model) with child routes.

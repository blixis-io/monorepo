# 019.003 — Implement the content type editor

## Status

```text
not-started
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
apps/admin/src/routes/content-types/index.tsx
apps/admin/src/routes/content-types/$contentTypeId.tsx
apps/admin/src/features/content-types/
apps/admin/test/content-types.test.tsx
```

### Modify

```text
apps/admin/src/routes/_app.tsx
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

- [ ] Editor can create a content type with every built-in field type.

## Validation

```bash
pnpm --filter @blixis/admin test
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
- [ ] Unsafe change errors are understandable.

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

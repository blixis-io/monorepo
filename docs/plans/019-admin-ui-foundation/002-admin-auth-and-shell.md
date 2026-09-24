# 019.002 — Implement admin authentication and navigation shell

## Status

```text
not-started
```

## Parent plan

[019 — Admin UI Foundation](./_index.md)

## Objective

Implement sign-in/sign-out, session bootstrap (`/auth/me`), organization and space switching, and the application shell (navigation, breadcrumbs, error boundaries, toasts) using the SDK.

## Background

007 auth routes; 008 organizations/spaces APIs.

## Requirements

- Sign-in page; redirect unauthenticated users; sign-out.
- Org/space switcher; create organization/space dialogs.
- Error handling mapping `BlixisApiError` codes to UI messages; request ID shown for support.
- CSRF compliance (007.006) handled by SDK/headers.
- Component tests; Playwright smoke for sign-in.

## Architectural constraints

- Never store tokens in `localStorage`; rely on HttpOnly cookie session.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/admin/src/routes/sign-in.tsx
apps/admin/src/routes/_app.tsx
apps/admin/src/components/space-switcher.tsx
apps/admin/src/lib/client.ts
apps/admin/test/
apps/admin/e2e/sign-in.spec.ts
apps/admin/playwright.config.ts
```

### Modify

```text
apps/admin/src/app.tsx
apps/admin/package.json
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. SDK client with cookie credentials.
2. Auth routes.
3. Shell and switcher.
4. Tests.

## Dependencies

Requires:

- [019.001 — Decide the admin stack and scaffold apps/admin](./001-admin-stack-and-scaffold.md)

## Acceptance criteria

- [ ] User can sign in, switch spaces, and sign out.
- [ ] Playwright sign-in smoke passes against local API.

## Validation

```bash
pnpm --filter @blixis/admin test
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
- [ ] Accessibility check (keyboard navigation, labels) on auth screens.

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

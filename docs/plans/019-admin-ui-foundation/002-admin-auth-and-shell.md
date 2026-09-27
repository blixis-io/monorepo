# 019.002 — Implement admin authentication and navigation shell

## Status

```text
completed
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
packages/sdk/src/session.ts
packages/sdk/test/session.test.ts
apps/admin/src/routes/root.tsx
apps/admin/src/routes/sign-in.tsx
apps/admin/src/routes/app-layout.tsx
apps/admin/src/routes/home.tsx
apps/admin/src/routes/space.tsx
apps/admin/src/lib/session.tsx
apps/admin/src/lib/queries.ts
apps/admin/src/lib/errors.ts
apps/admin/src/lib/slug.ts
apps/admin/src/lib/toast.ts
apps/admin/src/components/space-switcher.tsx
apps/admin/src/components/user-menu.tsx
apps/admin/src/components/create-organization-dialog.tsx
apps/admin/src/components/create-space-dialog.tsx
apps/admin/src/components/text-field.tsx
apps/admin/src/components/error-view.tsx
apps/admin/src/components/ui/{alert,card,dialog,dropdown-menu,input,label,toaster}.tsx
apps/admin/test/app.test.tsx (moved from src/app.test.tsx)
apps/admin/test/fake-api.ts
apps/admin/e2e/global-setup.ts
apps/admin/e2e/sign-in.spec.ts
apps/admin/playwright.config.ts
```

### Modify

```text
packages/sdk/src/http.ts (token function, credentials, onUnauthorized)
packages/sdk/src/index.ts
apps/admin/src/app.tsx
apps/admin/src/main.tsx
apps/admin/src/routes/router.tsx
apps/admin/package.json (zod, @playwright/test; test and e2e scripts)
apps/admin/tsconfig.json
apps/admin/vitest.config.ts
apps/admin/.gitignore
apps/admin/README.md
apps/docs/src/content/docs/getting-started/sdk.mdx
docs/sdk/README.md
biome.json (Node builtins allowed in apps/admin/e2e)
pnpm-lock.yaml
docs/ROADMAP.md
docs/plans/019-admin-ui-foundation/_index.md
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

- [x] User can sign in, switch spaces, and sign out.
- [x] Playwright sign-in smoke passes against local API.

## Validation

```bash
pnpm --filter @blixis/admin test
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
- [x] Accessibility check (keyboard navigation, labels) on auth screens.

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

- **Session in the SDK, not the admin:** `createBrowserSession` (`@blixis/sdk`) is reusable by any first-party browser app. Access token in memory; refresh token in the `HttpOnly; Secure; SameSite=Strict` cookie (`tokenDelivery: 'cookie'`, `credentials: 'include'`). It renews 60 s before expiry and after a `401` (the HTTP core got a token function and an `onUnauthorized` hook that repeats the request once). Refresh tokens rotate, so refreshes are deduplicated per tab and serialized across tabs with the Web Locks API; the server's 10 s rotation grace covers the rest. Nothing goes to `localStorage` (the e2e test asserts it).
- **CSRF (007.006):** the cookie endpoints need an allowed `Origin` and a JSON body; the session always sends `{}` as JSON, and the browser sets `Origin`. Local `AUTH_ALLOWED_ORIGINS` already lists `http://localhost:5173`; Chromium keeps `Secure` cookies on `http://localhost`.
- **Routing:** a pathless `app` layout route guards everything behind sign-in (`beforeLoad` redirects to `/sign-in?redirect=…`). `safeRedirect` only allows paths inside the admin, never `//host` or absolute URLs (open redirect). When the session ends elsewhere, the app clears the query cache and invalidates the router, so the guard redirects.
- **Errors:** `describeError` maps API codes to UI text and keeps the request ID (shown for support); route errors use an error boundary with "Try again"; queries don't retry 4xx. Toasts (Radix Toast via `radix-ui`, no extra dependency) confirm creations; errors stay inline.
- **Forms:** TanStack Form with Zod schemas through Standard Schema (Zod added to the admin; the slug rule mirrors `@blixis/spaces`). The slug follows the name until edited.
- **Accessibility:** labelled inputs with `autocomplete`, `aria-invalid` and `aria-describedby` errors, `role="alert"` for failures, a skip link, breadcrumbs with `aria-current`, keyboard-operable menus and dialogs (Radix), visible focus rings.
- **Tests:** 11 component tests with the real SDK session against an in-memory fake API (`test/fake-api.ts`). In jsdom, Radix menus open with ArrowDown (Enter toggles and proved order-dependent between tests). The Playwright smoke test (`pnpm --filter @blixis/admin e2e`, about 6 s) runs against the real local API: a wrong password shows a request ID; sign in, create an organization and two spaces, switch, reload (the session resumes from the cookie), sign out, and a deep link returns after signing in again. Playwright starts wrangler and Vite without the `pnpm` wrapper, which kept them running after the tests. The e2e test isn't in CI yet (it needs the API with Postgres); plan 021 can add it.
- **New dependencies:** `zod` (catalog) in the admin, `@playwright/test` 1.63.0 (dev).
- **Bundle:** one 642 kB chunk (196 kB gzip), over Vite's 500 kB warning. Acceptable for a signed-in admin for now; split routes with lazy loading when the editors (019.003–004) add weight.

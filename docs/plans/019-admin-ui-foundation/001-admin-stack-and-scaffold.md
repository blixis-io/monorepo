# 019.001 — Decide the admin stack and scaffold apps/admin

## Status

```text
completed
```

## Parent plan

[019 — Admin UI Foundation](./_index.md)

## Objective

Record ADR 0017 (bundler, router, data fetching, forms, hosting, auth integration) and scaffold `apps/admin` with React, shadcn/ui, Tailwind, lint/typecheck/test integration, and a deployable build.

## Background

§3 React + shadcn/ui; 007 cookie sessions; 017 SDK.

## Requirements

- ADR 0017: Vite (or alternative) with TS7 compatibility check, router (e.g. TanStack Router / React Router), server-state library (e.g. TanStack Query), forms (library compatible with ADR 0004 schemas via Standard Schema), hosting & cookie strategy, testing (Vitest + Testing Library, Playwright for smoke).
- Scaffold app with shadcn/ui initialised, base layout, dark/light theme tokens.
- Admin tsconfig extends base + DOM.
- Boundary rule: `apps/admin` may import only `@blixis/sdk` (and shared UI deps), not server packages.
- Build output wired to chosen hosting (e.g. Workers static assets config in `apps/api/wrangler.jsonc` or separate Worker).

## Architectural constraints

- No server package imports.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0017-admin-stack.md
apps/admin/README.md
apps/admin/.gitignore
apps/admin/package.json
apps/admin/tsconfig.json
apps/admin/vite.config.ts
apps/admin/vitest.config.ts
apps/admin/wrangler.jsonc
apps/admin/index.html
apps/admin/components.json
apps/admin/src/main.tsx
apps/admin/src/app.tsx
apps/admin/src/app.test.tsx
apps/admin/src/styles.css
apps/admin/src/routes/router.tsx
apps/admin/src/components/ui/button.tsx
apps/admin/src/components/theme-toggle.tsx
apps/admin/src/lib/config.ts
apps/admin/src/lib/theme.ts
apps/admin/src/lib/utils.ts
packages/kernel/src/internal/cors.ts
```

### Modify

```text
packages/kernel/src/internal/rest.ts (CORS option)
packages/kernel/src/internal/rest.test.ts
packages/kernel/src/create-blixis.ts
packages/kernel/src/index.ts
apps/api/src/index.ts (CORS origins from AUTH_ALLOWED_ORIGINS)
tooling/boundaries/src/rules.ts (.test.tsx files are tests)
.github/workflows/ci.yml (admin build and dry-run deploy)
biome.json (Tailwind CSS directives)
tsconfig.json
vitest.config.ts
pnpm-lock.yaml
docs/decisions/README.md
docs/operations/configuration.md
docs/operations/cloudflare.md
docs/development/getting-started.md
docs/ROADMAP.md
docs/plans/019-admin-ui-foundation/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. ADR 0017.
2. Scaffold and shadcn init.
3. Boundary rule.
4. Build and hosting wiring.

## Dependencies

Requires:

- [017.004 — Build the Astro example site](../017-sdk-and-example-consumer/004-example-astro-site.md)

## Acceptance criteria

- [x] `pnpm --filter @blixis/admin build` succeeds; app loads locally.
- [x] Importing a server package from admin fails lint.

## Validation

```bash
pnpm --filter @blixis/admin dev
pnpm --filter @blixis/admin build
pnpm lint
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
- [x] Hosting choice keeps cookies secure (`Secure`, `HttpOnly`, `SameSite`).

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

- **Decision:** [ADR 0017](../../decisions/0017-admin-stack.md). The owner chose a separate Worker at `admin.<domain>` and the proposed stack. `workers.dev` and `pages.dev` are on the Public Suffix List (checked), so the `SameSite=Strict` refresh cookie only works once admin and API share a custom domain (plan 021).
- **The boundary rule already existed** (`ADMIN_ALLOWED_WORKSPACE_IMPORTS`, since 003). Importing `@blixis/kernel` from `apps/admin/src` fails `pnpm boundaries` (checked). `.test.tsx` files now count as tests.
- **CORS lives in the kernel** (`createBlixis({ cors })`, `src/internal/cors.ts`): exact origin with credentials, preflight 204, `Vary: Origin` on every response, and no CORS headers for other origins. The API reuses `AUTH_ALLOWED_ORIGINS`, so staging and production allow nothing until the admin origin is added.
- **Build:** Vite bundles; `tsc -b` type-checks the admin (`moduleResolution: bundler`, DOM libs, `jsx: react-jsx`). The API origin per mode lives in `vite.config.ts` because `.env.*` files are ignored by the root `.gitignore`. The `_headers` CSP is emitted by a small Vite plugin. Source maps are off until they can be uploaded to Sentry (020).
- **Checked locally:** `wrangler dev` on the built output serves the SPA fallback (`/spaces/x` → `index.html`) with the CSP headers; in Chrome the page renders with no console errors or CSP violations, the not-found route works, and the theme toggle switches light/dark. The CI step builds for staging and runs `wrangler deploy --dry-run --env staging`.
- **Tests:** without Vitest globals, Testing Library doesn't clean up between tests automatically; `app.test.tsx` calls `cleanup()` in `afterEach`.
- **Versions checked:** vite 8.3.0, @vitejs/plugin-react 6.1.1, react 19.3.0, @tanstack/react-router 1.170.38, @tanstack/react-query 5.103.1, @tanstack/react-form 1.33.5, tailwindcss 4.3.3, jsdom 30.1.0 (all at least a week old for pnpm's minimum release age).
- **For 019.002:** the SDK's `signIn` asks for `tokenDelivery: 'body'`. The admin needs the cookie delivery and `credentials: 'include'` for refresh, and Playwright smoke tests.

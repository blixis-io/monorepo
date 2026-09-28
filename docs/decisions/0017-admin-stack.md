# 0017 — Admin stack and hosting: React SPA on its own Worker at admin.&lt;domain&gt;

- Status: accepted
- Date: 2026-09-27
- Roadmap task: [019.001](../plans/019-admin-ui-foundation/001-admin-stack-and-scaffold.md) (decision register D21)

## Context

The admin UI (§3, §50) is a browser client of the Management API. It signs in with ADR 0009: the access token lives in memory, the refresh token in an `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie set by the API. A `SameSite=Strict` cookie is only sent when the page and the API are the **same site** (same registrable domain). The admin must use only `@blixis/sdk` (boundary rule since 003), so it can't reach into server packages.

Hosting options:

- **(a) Static assets in the API Worker** under `/admin`: same origin, no CORS. It couples admin releases to API deploys, mixes SPA fallback routing with the API router, and puts the admin's HTML on the API origin (CSP and caching rules for two different kinds of response in one Worker).
- **(b) A separate Worker with static assets at `admin.<domain>`**, beside `api.<domain>`: same site, so the refresh cookie works. Independent deploys and headers. It needs credentialed CORS on the API for the admin origin, and a custom domain: `workers.dev` and `pages.dev` are on the Public Suffix List, so `blixis-admin-staging.<sub>.workers.dev` and `blixis-api-staging.<sub>.workers.dev` are **different sites**, and the browser never sends the cookie between them.
- **(c) Cloudflare Pages**: same constraints as (b); Workers static assets are Cloudflare's recommended path for new projects, and one deploy tool (wrangler) for everything is simpler.

The owner chose **(b)**.

## Decision

1. **Hosting.** `apps/admin` builds to static files deployed as the `blixis-admin` Worker (assets only, no Worker script), environments `staging` and `production` like the API. `not_found_handling: "single-page-application"` serves `index.html` for client-side routes. Custom domains `admin.staging.<domain>` and `admin.<domain>` (plan 021), next to `api.staging.<domain>` and `api.<domain>`.
2. **CORS in the kernel.** `createBlixis({ cors: { origins } })` answers preflights and adds `Access-Control-Allow-Origin` (the exact origin, never `*`), `Access-Control-Allow-Credentials: true`, and exposed headers (`ETag`, `Location`, `Retry-After`, request ids, `X-Blixis-Cache`) for allowed origins only; every response varies on `Origin`. The API takes the origins from `AUTH_ALLOWED_ORIGINS`, the same list that guards the cookie endpoints (ADR 0009 CSRF), so one setting names the trusted browser apps.
3. **Stack.**
   - **React 19 + Vite 8** (`@vitejs/plugin-react`). Vite bundles TypeScript itself; `tsc -b` type-checks the admin like every other package (TS 7 has no issue with a no-emit browser project).
   - **shadcn/ui** components copied into `src/components/ui` (Radix primitives via `radix-ui`, `class-variance-authority`, `lucide-react`), styled with **Tailwind CSS v4** (`@tailwindcss/vite`). Theme tokens are CSS variables for light and dark; the theme follows the system unless the user picks one.
   - **TanStack Router** (code-based routes, typed params and search), **TanStack Query** for server state, **TanStack Form** for forms (it accepts Standard Schema validators, so the Zod schemas of ADR 0004 fit).
   - **Data access only through `@blixis/sdk`**: the generated Management API types keep the admin in step with the OpenAPI document (ADR 0015).
4. **Build configuration.** The API origin is fixed per build mode in `vite.config.ts` (public, so committed), overridable by `VITE_BLIXIS_API_URL`. The build emits `_headers` with a strict CSP (`script-src 'self'`, `connect-src` limited to the API, `frame-ancestors 'none'`) and `nosniff`.
5. **Testing.** Vitest (`admin` project, jsdom) with Testing Library for components; Playwright smoke tests against a running admin and API from 019.002 on.

## Addendum (019.004): rich-text editor

The rich-text field uses **Tiptap 3** (MIT, on ProseMirror). Its JSON uses the same node and mark names as the stored format (ADR 0010 §5), so documents go to the API as the editor produces them. The editor is configured from each field's settings (allowed nodes, marks, heading levels), so it can't produce content the server would reject, pasting included; embedded entries and assets are small custom nodes with an `id` attribute. Tiptap loads on demand with the first rich-text field (about 140 kB gzip), not with the admin.

Entries are saved explicitly (button or ⌘/Ctrl+S). There is no autosave: every save is a new immutable version (plan 011), and a timer would multiply them.

## Consequences

- Admin and API deploy independently; the admin can be rolled back without touching the API.
- Sign-in with a refresh cookie needs the custom domain. Until it exists, the staging admin on `workers.dev` can sign in (bearer, CORS) only if `AUTH_ALLOWED_ORIGINS` lists its origin, and has no silent refresh. Local development works: `localhost:5173` and `localhost:8787` are the same site.
- ADR 0009 mentions a `__Host-` cookie prefix once a custom domain exists. `__Host-` requires `Path=/`, which conflicts with `Path=/api/v1/auth`; 019.002 keeps the path-scoped cookie without the prefix, or revisits ADR 0009.
- A new origin that must call the API with credentials (another first-party app) is added to `AUTH_ALLOWED_ORIGINS`; third-party sites use API tokens and the public delivery endpoints, never credentialed CORS.

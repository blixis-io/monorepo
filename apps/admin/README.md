# Admin (React)

The Blixis admin UI (plan 019, [ADR 0017](../../docs/decisions/0017-admin-stack.md)): a single-page app that talks to the Management API only through [`@blixis/sdk`](../../docs/sdk/README.md). It deploys as its own Worker (`blixis-admin`, static assets only) at `admin.<domain>`, beside the API at `api.<domain>`.

Stack: React 19 + Vite 8, [shadcn/ui](https://ui.shadcn.com) components in `src/components/ui` on Tailwind CSS v4, TanStack Router (routes in `src/routes`), TanStack Query (server state), TanStack Form (forms). The boundary checker rejects any workspace import other than `@blixis/sdk`.

## Run it locally

Start the API first (see [getting started](../../docs/development/getting-started.md)); its `AUTH_ALLOWED_ORIGINS` already allows `http://localhost:5173`.

```bash
pnpm --filter @blixis/admin dev                # http://localhost:5173, API at http://localhost:8787
pnpm --filter @blixis/admin build              # dist/ for production
pnpm --filter @blixis/admin build:staging      # dist/ against the staging API
pnpm --filter @blixis/admin test               # component tests (jsdom, fake API)
pnpm --filter @blixis/admin e2e                # Playwright smoke test against the real local API
```

Sign in with a local user (`pnpm auth:create-user`, see getting started). Sessions follow ADR 0009: `createBrowserSession` from the SDK keeps the access token in memory and the refresh token in an `HttpOnly` cookie, so a reload resumes the session and nothing sensitive is in `localStorage`.

The **e2e test** needs Docker Postgres, migrated (`DATABASE_URL=postgres://blixis:blixis@localhost:5432/blixis pnpm db:migrate`), `apps/api/.dev.vars` with `AUTH_SIGNING_KEYS`, and Playwright's Chromium (`pnpm --filter @blixis/admin exec playwright install chromium`). It starts the API (`:8787`) and the admin (`:5173`) unless they already run, and creates a throwaway user per run.

## Structure

- `src/routes/`: `root.tsx` (error boundary, not found), `sign-in.tsx`, `app-layout.tsx` (the signed-in shell; redirects to sign-in and back), `home.tsx` (organizations and spaces), `space.tsx`; `router.tsx` assembles them.
- `src/lib/`: `session.tsx` (session context, `useClient`, `useUser`, `safeRedirect`), `queries.ts` (TanStack Query keys and fetchers), `errors.ts` (API error codes to UI messages, with the request ID for support), `toast.ts`.
- `src/components/`: the space switcher, create dialogs, user menu, `TextField` (TanStack Form field with accessible errors), `ErrorView`, and shadcn/ui components in `ui/`.
- Forms validate with Zod schemas through Standard Schema (ADR 0004) before calling the API, and show the API's errors inline.

## Configuration

The API origin is chosen per build mode in `vite.config.ts` (`development`, `staging`, `production`); set `VITE_BLIXIS_API_URL` (environment or an ignored `.env.local`) to point a build elsewhere. The build writes `dist/_headers` with the Content-Security-Policy: scripts and styles from the admin itself, connections only to that API, no framing.

## Adding UI components

Components follow [shadcn/ui](https://ui.shadcn.com/docs/components): copy a component's source into `src/components/ui` and change its imports to relative paths with extensions (`../../lib/utils.ts`), as in `button.tsx`; the repository uses no `@/` path alias. `components.json` records the style and paths for reference.

Components use the theme tokens in `src/styles.css` (`bg-background`, `text-muted-foreground`, `border-border`, …), which switch between light and dark with the `dark` class on `<html>`.

## Deploy

The owner deploys. The refresh cookie is `SameSite=Strict`, so sign-in with silent refresh needs the admin and the API on the same site: custom domains `admin.<domain>` and `api.<domain>` (plan 021). On `workers.dev` (a public suffix) the admin can't share the cookie with the API.

```bash
pnpm --filter @blixis/admin deploy:staging     # vite build --mode staging && wrangler deploy --env staging
```

Then add the admin origin to the API's `AUTH_ALLOWED_ORIGINS` for that environment (CORS and cookie endpoints).

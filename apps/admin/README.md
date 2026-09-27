# Admin (React)

The Blixis admin UI (plan 019, [ADR 0017](../../docs/decisions/0017-admin-stack.md)): a single-page app that talks to the Management API only through [`@blixis/sdk`](../../docs/sdk/README.md). It deploys as its own Worker (`blixis-admin`, static assets only) at `admin.<domain>`, beside the API at `api.<domain>`.

Stack: React 19 + Vite 8, [shadcn/ui](https://ui.shadcn.com) components in `src/components/ui` on Tailwind CSS v4, TanStack Router (routes in `src/routes`), TanStack Query (server state), TanStack Form (forms). The boundary checker rejects any workspace import other than `@blixis/sdk`.

## Run it locally

Start the API first (see [getting started](../../docs/development/getting-started.md)); its `AUTH_ALLOWED_ORIGINS` already allows `http://localhost:5173`.

```bash
pnpm --filter @blixis/admin dev                # http://localhost:5173, API at http://localhost:8787
pnpm --filter @blixis/admin build              # dist/ for production
pnpm --filter @blixis/admin build:staging      # dist/ against the staging API
npx vitest run --project admin                 # component tests (jsdom)
```

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

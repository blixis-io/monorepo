# Example site (Astro)

A small blog built from Blixis content with [`@blixis/sdk`](../../docs/sdk/README.md) (plan 017.004): a post list and post pages in English and Dutch, with authors, cover images, rich text, and a preview build that shows drafts.

- **Static output.** Every page is rendered at build time from the GraphQL delivery API. Keys are read at build time only; the output is plain HTML that never contains them.
- **Preview** is a second build with `BLIXIS_PREVIEW=1`, using the **preview key** — deploy it to a protected URL for editors. `pnpm dev` with `BLIXIS_PREVIEW=1` shows drafts live.

## Run it locally

1. **Start the API** (see [getting started](../../docs/development/getting-started.md)): Docker Postgres, `pnpm db:migrate`, create a user (`pnpm auth:create-user`), then `pnpm --filter @blixis/api dev` (`http://localhost:8787`).
2. **Create an API token** for that user (`POST /api/v1/auth/tokens`, or Postman *API tokens*).
3. **Seed** a space with the example model and content — it prints the `.env` lines:
   ```bash
   BLIXIS_API_URL=http://localhost:8787 BLIXIS_TOKEN=blx_pat_… \
     pnpm --filter @blixis/example-site seed > apps/example-site/.env
   ```
   Set `BLIXIS_SPACE_ID` to seed an existing space instead of a new one.
4. **Develop or build:**
   ```bash
   pnpm --filter @blixis/example-site dev             # http://localhost:4321
   pnpm --filter @blixis/example-site build           # dist/: published content
   pnpm --filter @blixis/example-site build:preview   # dist-preview/: drafts too
   ```

| Variable | |
|---|---|
| `BLIXIS_API_URL` | the API's origin |
| `BLIXIS_DELIVERY_KEY` | `blx_dk_…`: published content |
| `BLIXIS_PREVIEW_KEY` | `blx_pk_…`: drafts (preview builds only; keep it secret) |
| `BLIXIS_PREVIEW` | `1` for the preview build |

## The content model

| Type | Fields |
|---|---|
| `author` | `name` (text), `avatar` (image asset) |
| `post` | `title` (localized text), `slug`, `excerpt` (localized), `cover` (image asset), `author` (reference), `body` (localized rich text with embedded images) |

`src/lib/blixis.ts` holds the GraphQL queries (typed with `TypedDocument`; with GraphQL Codegen you'd generate them) and `src/lib/rich-text.ts` renders rich text to escaped HTML.

## Deploy

The build output is static, so any static host works. On Cloudflare:

```bash
pnpm --filter @blixis/example-site build
npx wrangler pages deploy apps/example-site/dist --project-name blixis-example
```

Run the build in CI with the variables above as secrets (never commit `.env`).

## Rebuild when content changes

Create a [webhook](../../apps/docs/src/content/docs/content/webhooks-api.mdx) for `entry.published`, `entry.unpublished`, and `asset.*` that triggers your build:

- **GitHub Actions:** point it at a small Worker that verifies `Blixis-Signature` ([receiver example](../../docs/api/webhooks.md#verify-the-signature)) and calls the [`repository_dispatch`](https://docs.github.com/en/rest/repos/repos#create-a-repository-dispatch-event) API; the workflow listens for that event and builds.
- **Cloudflare Pages deploy hooks** can't verify signatures; if you point the webhook at one directly, keep its URL secret.

## Tests

`test/site.test.ts` seeds an in-process API through the SDK, serves it on a local port, runs `astro build` for the published and the preview site, and checks the HTML (posts, locales, rich text, images, drafts only in preview, no keys in the output). It runs with the database tests (`pnpm test:db`).

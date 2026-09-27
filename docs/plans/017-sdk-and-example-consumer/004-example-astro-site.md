# 017.004 — Build the Astro example site

## Status

```text
completed
```

## Parent plan

[017 — SDK & Example Astro Consumer](./_index.md)

## Objective

Create `apps/example-site` (Astro) that renders a sample content model (e.g. blog posts with authors and images) using the SDK delivery client, supports preview mode, and documents deployment and webhook-triggered rebuilds.

## Background

§3 `apps/example-site` Astro; proves consumer experience end to end.

## Requirements

- Astro project using `@blixis/sdk` via workspace dependency (consumed as a normal package).
- Seed script creating the sample model and content via the SDK management client.
- Pages: index (list), post detail with linked author and asset images, locale switch.
- Preview mode route using preview key (server-side only; never ship keys to the browser).
- README: local run against `wrangler dev` API, deploy option (Cloudflare Pages/Workers static assets), webhook → rebuild hook setup.

## Architectural constraints

- Delivery/preview keys only in server environment variables.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/example-site/ (package.json, astro.config.mjs, tsconfig.json, .gitignore, README.md)
apps/example-site/src/lib/{blixis,rich-text}.ts
apps/example-site/src/layouts/Layout.astro
apps/example-site/src/pages/[...lang]/index.astro
apps/example-site/src/pages/[...lang]/posts/[slug].astro
apps/example-site/scripts/seed.ts
apps/example-site/test/site.test.ts
apps/api/test/sdk.worker.test.ts
```

### Modify

```text
vitest.config.ts (example-site tests), biome.json (example-site Node files, .astro rules)
apps/api/package.json, apps/api/tsconfig.json (SDK in workerd)
apps/docs/src/content/docs/getting-started/sdk.mdx
docs/plans/017-sdk-and-example-consumer/*, docs/ROADMAP.md, pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold Astro app.
2. Seed script.
3. Pages and preview.
4. README.

## Dependencies

Requires:

- [017.003 — Add the GraphQL delivery client](./003-sdk-graphql-delivery-client.md)

## Acceptance criteria

- [x] `pnpm --filter example-site build` succeeds against a seeded local API.
- [x] Preview shows draft changes; production build shows published only.

## Validation

```bash
pnpm --filter @blixis/api dev   # separate shell
pnpm --filter example-site seed && pnpm --filter example-site build
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
- [x] Example uses only public SDK APIs.

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

- **Preview without an SSR adapter:** the site is fully static; preview is a second build with `BLIXIS_PREVIEW=1` and the preview key (`build:preview` → `dist-preview/`), and `astro dev` shows drafts live. Keys are read at build time through `process.env` only; the HTML never contains them (tested). An SSR preview route would need `@astrojs/cloudflare` — not worth a dependency for the example.
- **Env loading:** Astro doesn't put `.env` into `process.env`; scripts run Astro through `node --env-file-if-exists=.env`.
- **Seed script** (`scripts/seed.ts`, Node's built-in TypeScript): locales, `author` and `post` types, three generated PNGs (no binary files in the repo), an author, two published posts (one translated) and a draft, and a delivery and a preview key — all through `@blixis/sdk`; prints the `.env` lines.
- **Rich text** (`src/lib/rich-text.ts`): paragraphs, headings (h2–h6), lists, quotes, code, rules, breaks, marks (bold, italic, underline, strike, code, link with the same href rule the API validates), embedded assets; everything escaped; unknown nodes keep their text.
- **End-to-end test** (`test/site.test.ts`, with the DB tests): the real modules in-process behind a local HTTP server, seeded through the SDK; `astro build` runs as a child process for the published and preview sites; assertions on posts, locales, rich text, image URLs, drafts only in preview, and no keys in the output.
- **SDK in a web-standard runtime:** `apps/api/test/sdk.worker.test.ts` runs the SDK in workerd (no Node APIs, like browsers): retries with one idempotency key, uploads, persisted queries, error mapping. DB-backed contract tests stay in Node (the Workers-pool DB quarantine).
- **Lint:** Biome can't see template usage in `.astro` files, so `noUnusedImports`/`noUnusedVariables` are off for them (Biome's recommendation); `apps/example-site/**` may use Node built-ins (build scripts and tests).

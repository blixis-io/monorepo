# 023.004 — Deploy the documentation site to Cloudflare

## Status

```text
review
```

## Parent plan

[023 — Developer Documentation Site](./_index.md)

## Objective

Deploy the built site as a Cloudflare Worker with static assets (`blixis-docs`), from GitHub Actions on every push to `main`, with a documented manual deploy path.

## Background

Cloudflare is the platform (§11); the docs are public like the repository. Workers static assets serve prebuilt sites without Worker code.

## Requirements

- `apps/docs/wrangler.jsonc`: assets-only Worker `blixis-docs`, `assets.directory` = Astro output, `not_found_handling` suitable for a static site, pinned `compatibility_date`.
- GitHub Actions: deploy job on push to `main` (after `verify`), using `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` from a `docs` (or repository) environment; skipped cleanly when secrets are missing.
- First deploy performed with the owner's approval; URL recorded in README and docs.
- `docs/operations/cloudflare.md`: add the docs Worker to the resource inventory.

## Architectural constraints

- No secrets in the repository; PR workflows never deploy.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/docs/wrangler.jsonc
.github/workflows/docs.yml
```

### Modify

```text
apps/docs/package.json (deploy scripts, wrangler)
apps/docs/astro.config.mjs (site URL)
pnpm-workspace.yaml (catalog: wrangler; allowBuilds: workerd; minimumReleaseAgeExclude)
pnpm-lock.yaml
docs/operations/cloudflare.md
docs/contracts/README.md
docs/setup-checklist.md
README.md
docs/ROADMAP.md
docs/plans/023-developer-documentation-site/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Add Wrangler config and `deploy` script.
2. Dry-run locally.
3. Add the workflow.
4. First deploy (owner approval) and record the URL.

## Dependencies

Requires:

- [023.003 — Write the developer manual for module authors](./003-write-developer-manual.md)

## Acceptance criteria

- [x] `wrangler deploy --dry-run` succeeds for the docs app.
- [x] The site is reachable on its URL after deploy.
- [ ] The workflow deploys on `main` and never on pull requests. *(never on PRs: yes; deploy on `main`: pending the `docs` API token)*

## Validation

```bash
pnpm --filter @blixis/docs build
pnpm --filter @blixis/docs exec wrangler deploy --dry-run
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
- [x] API token scope limited to Workers scripts for this account.

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

- **Deployed** (owner-approved, via the maintainer's local Wrangler OAuth login): assets-only Worker `blixis-docs` → https://blixis-docs.frosty-hill-6079.workers.dev (238 assets; versions `496aa31a…` then `9c74bf5a…` after setting the real `site` URL). Verified: `/`, a manual page, a concept page, and a reference page return 200 with correct titles; unknown paths return 404 (`404-page` handling); sitemap uses the real URL.
- `apps/docs/wrangler.jsonc`: no `main` (static assets only), `assets.directory ./dist`, `not_found_handling: 404-page`, `html_handling: auto-trailing-slash`, `workers_dev: true`, `preview_urls: false`, compatibility date 2026-08-15 (kept ≤ the Workers test pool's runtime, ADR 0002).
- **pnpm 12:** Wrangler's `workerd` needs its install script → `allowBuilds: workerd: true` (placeholder line written by pnpm on the failed install removed again). pnpm also added `minimumReleaseAgeExclude` entries for recently published `hono`, `astro`, `wrangler` versions.
- **GitHub:** repository variable `CLOUDFLARE_ACCOUNT_ID`; environment `docs` (deployment branch policy: `main` only) with variable `DOCS_URL`.
- **Workflow `docs.yml`:** runs on pushes to `main` touching docs/packages (+ manual dispatch), never on PRs; builds the site, then deploys only if `CLOUDFLARE_API_TOKEN` exists in the `docs` environment, otherwise emits a notice and skips.
- **Open (why the task is in `review`):** the automatic deploy path cannot be verified until the owner creates a Cloudflare API token (Account · Workers Scripts · Edit) and stores it as `CLOUDFLARE_API_TOKEN` in the `docs` environment. Then: run the workflow once, confirm the deploy, tick the last acceptance criterion, and complete the task and plan 023.

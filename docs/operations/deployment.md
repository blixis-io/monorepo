# Release & Deployment

How code moves from `main` to staging and from versions to production. Automation is implemented in roadmap plan [021 — CI/CD & Release Engineering](../plans/021-ci-cd-and-release-engineering/_index.md); manual steps before that are listed at the end.

Related: [Environments](./environments.md) · [GitHub Actions](./github-actions.md) · [Cloudflare Workers](./cloudflare.md) · [Commit messages](../conventions/commit-messages.md)

---

## Versioning

- The deployable platform (API Worker, and admin if hosted with it) uses **Semantic Versioning** with Git tags **`vX.Y.Z`**.
- Stay on **`0.y.z`** until the MVP launch (plan 022); breaking changes bump the minor version while on `0.x`.
- Versions are derived from [Conventional Commits](../conventions/commit-messages.md): `fix`/`perf` → patch, `feat` → minor, `!`/`BREAKING CHANGE` → major (minor on `0.x`).
- Each release has a GitHub Release with generated notes and an entry in `CHANGELOG.md`.
- Public npm packages are versioned separately (roadmap 018.005); the recommendation is to use the same release tool in manifest mode so there is one versioning system.

## Release tooling: release-please (recommended)

[release-please](https://github.com/googleapis/release-please-action) fits Conventional Commits + GitHub Flow:

1. On every push to `main`, release-please updates a **release PR** (`chore(release): release vX.Y.Z`) that accumulates the changelog and version bump.
2. When you are ready to ship, **merge the release PR** (squash).
3. release-please creates the tag `vX.Y.Z` and the GitHub Release.
4. The same workflow run then deploys that tag to production (see below).

Files (created in task 021.001): `release-please-config.json`, `.release-please-manifest.json`, `CHANGELOG.md`, `.github/workflows/release.yml`.

> **Gotcha:** tags and releases created with the default `GITHUB_TOKEN` do **not** trigger other workflows. Therefore the production deploy runs as a **dependent job in the same release workflow** (`if: needs.release.outputs.release_created`), not as a separate `on: release` workflow. The alternative is a GitHub App token for release-please.

## Staging deployment (every merge to `main`)

```text
push to main
  └─ ci.yml: format · lint · typecheck · test · build · wrangler dry-run
      └─ deploy-staging job (environment: staging, concurrency: deploy-staging, no cancel)
          1. pnpm install --frozen-lockfile && pnpm build
          2. pnpm db:migrate               (DATABASE_URL = staging migration role)
          3. wrangler deploy --env staging --var BLIXIS_VERSION:<sha>
          4. upload source maps + create Sentry release <sha> (environment staging)
          5. smoke: /api/v1/health/ready + content smoke (tooling/smoke)
          6. on smoke failure: wrangler rollback --env staging; job fails
```

## Production deployment (every version)

```text
merge release PR
  └─ release.yml
      ├─ release-please → creates tag vX.Y.Z + GitHub Release
      └─ deploy-production job (needs release_created; environment: production)
          1. checkout tag vX.Y.Z
          2. pnpm install --frozen-lockfile && pnpm build
          3. pnpm db:migrate               (DATABASE_URL = production migration role)
          4. wrangler deploy --env production --var BLIXIS_VERSION:vX.Y.Z
          5. upload source maps + create/finalise Sentry release vX.Y.Z (environment production)
          6. smoke against production (read-only checks + dedicated smoke space)
          7. on failure: roll back Worker, mark release as failed (comment on release), alert
```

- **Approval (optional):** configure required reviewers on the `production` GitHub environment to pause before step 3. Availability for private repositories depends on the GitHub plan — see [Repository settings](./repository.md#environments).
- **Version visibility:** `BLIXIS_VERSION` is returned by `GET /api/v1/health` and the GraphQL `_platform.version` field.
- **Concurrency:** one production deploy at a time (`concurrency: deploy-production`, `cancel-in-progress: false`) — never cancel a run that may be mid-migration.

## Migrations

- Run **before** the Worker deploy, from CI, with the **migration role** (DDL rights) over a direct Neon connection — never through Hyperdrive and never from the Worker.
- Must be **backward compatible** with the currently deployed version (expand/contract):
  1. *Expand* release: add new columns/tables; code writes both / reads new with fallback.
  2. *Contract* release (later): remove old columns once no deployed version uses them.
- A failed migration stops the deploy before the Worker changes.
- Migrations are forward-only; rollback relies on backward compatibility, not `down` migrations.

## Rollback

| Situation | Action |
|---|---|
| Bad Worker code, schema fine | `wrangler rollback --env production` (instant, previous Worker version) **or** run the `deploy-production` workflow manually with the previous tag |
| Bad staging deploy | `wrangler rollback --env staging` or fix forward on `main` |
| Bad migration | Fix forward with a new migration in a patch release; restore from Neon point-in-time only for data loss (runbook: `docs/operations/disaster-recovery.md`, task 022.002) |

Manual redeploy of any tag: `gh workflow run release.yml -f tag=v0.4.1` (the workflow supports `workflow_dispatch` with a `tag` input for redeploys/rollbacks — task 021.001).

## Hotfix

1. `fix/<description>` branch → PR → merge to `main` → staging verifies.
2. Merge the release PR (it now contains the fix as a patch bump) → production.
3. If production must be stabilised first, roll back (above), then ship the fix.

## Before automation exists (plans 004–020)

Until plan 021 lands, deployments are manual and staging-only:

```bash
pnpm --filter @blixis/api exec wrangler deploy --env staging
DATABASE_URL=<staging migration url> pnpm db:migrate
```

Production is not deployed before plan 021 and the launch checklist (022.005).

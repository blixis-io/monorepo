# Environments

Blixis runs in two deployed environments — **staging** and **production** — plus local development and (planned) pull-request previews. All deployed environments use the same code path and the same Cloudflare resource types; they differ only in configuration, data, and how code reaches them.

Related: [Release & deployment](./deployment.md) · [Cloudflare Workers](./cloudflare.md) · [GitHub Actions](./github-actions.md) · [Git workflow](../conventions/git-workflow.md)

---

## Overview

```text
 feature branch ──PR──▶ main ──(auto)──▶ STAGING
                          │
                          └── release PR merged ──▶ tag vX.Y.Z ──(auto)──▶ PRODUCTION
```

| | Local | Preview *(planned, 021.002)* | **Staging** | **Production** |
|---|---|---|---|---|
| Source | working tree | PR head | **`main`** | **release tags `vX.Y.Z`** |
| Trigger | `pnpm dev` | PR opened/updated | push/merge to `main` | GitHub Release created by the release workflow |
| `BLIXIS_ENV` | `local` | `preview` | `staging` | `production` |
| Wrangler env | *(top level)* | `preview` / version alias | `--env staging` | `--env production` |
| Worker name | local only | preview version of staging Worker | `blixis-api-staging` | `blixis-api-production` |
| GitHub environment | — | `preview` | `staging` | `production` |
| Database | Docker Postgres | Neon branch per PR | Neon branch `staging` | Neon branch `production` (primary) |
| Hyperdrive | local connection string | per-preview or shared (TBD) | `blixis-staging` | `blixis-production` |
| Queues | local simulation | staging or per preview (TBD) | `blixis-events-staging` (+ `-dlq`) | `blixis-events-production` (+ `-dlq`) |
| KV | local simulation | staging | `blixis-cache-staging` | `blixis-cache-production` |
| R2 | local simulation | staging | `blixis-assets-staging` | `blixis-assets-production` |
| Hostname | `localhost:8787` | `*.workers.dev` preview URL | `api.staging.<domain>` | `api.<domain>` |
| GraphiQL / OpenAPI docs | on | on | on | off |
| Log level | `debug` | `debug` | `debug`/`info` | `info` |
| Data | disposable seed | disposable | test data, resettable | customer data |

`<domain>` is not decided yet — see [setup checklist](../setup-checklist.md#domains-and-dns).

## Staging

- **Represents `main`.** Every merge to `main` runs CI, applies migrations to the staging database, deploys the staging Worker, and runs smoke tests.
- Purpose: integration testing on real Cloudflare + Neon infrastructure, demoing, verifying migrations before they reach production, and rehearsing releases.
- Staging may be broken briefly by a bad merge; fix forward on `main` or roll back the staging Worker.
- Never copy production data into staging unless it is anonymised.
- Seed/test data can be reset (Neon branch reset from a seed snapshot — procedure in `docs/operations/database.md`, task 005.003).

## Production

- **Runs versions only.** A version is a Git tag `vX.Y.Z` on a commit that has already been deployed to staging.
- Deployed automatically when a release is created (see [Release & deployment](./deployment.md)); optional manual approval via the `production` GitHub environment.
- Rollback = redeploy the previous version (or `wrangler rollback`), never a hot edit.
- Production credentials are only available to the production deploy job.

## Configuration per environment

| Kind | Where it lives | Example |
|---|---|---|
| Non-secret vars | `apps/api/wrangler.jsonc` `env.<name>.vars` | `BLIXIS_ENV`, `LOG_LEVEL`, allowed origins |
| Worker secrets | `wrangler secret put <NAME> --env <name>` | `WEBHOOK_SECRET_KEY`, auth secrets |
| Bindings | `wrangler.jsonc` `env.<name>` (must be declared **per environment**) | `HYPERDRIVE`, `EVENTS`, `CACHE_KV`, `ASSETS` |
| CI secrets | GitHub environment secrets (`staging`, `production`) | `CLOUDFLARE_API_TOKEN`, `DATABASE_URL` (migration role) |
| CI variables | GitHub environment/repository variables | `CLOUDFLARE_ACCOUNT_ID`, `STAGING_API_URL` |
| Local | `apps/api/.dev.vars` (git-ignored), `.dev.vars.example` committed | local secrets |

The complete variable list is maintained in `docs/operations/configuration.md` (task 004.004).

## Promotion rules

1. Code reaches production only through staging (tags are created from `main`).
2. Migrations are **expand/contract** so the version currently in production keeps working after staging (and later production) migrations run.
3. A release must not be cut while staging is red (failed deploy or smoke).
4. Hotfixes follow the same path: `fix/…` branch → `main` (staging) → patch release.

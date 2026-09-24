# Cloudflare Workers

Cloudflare configuration for the Blixis API Worker: resource naming, `wrangler.jsonc` structure per environment, secrets, local development, and CI access. Implements architecture §11–§19 and §46 (one modular-monolith Worker). The actual configuration is created by roadmap plans 004 (Worker), 005 (Hyperdrive), 006 (Queues), 013 (KV/Cache), 014 (R2), and 016 (Workflows); this document is the reference those tasks follow and extend.

Related: [Environments](./environments.md) · [Release & deployment](./deployment.md) · [GitHub Actions](./github-actions.md)

---

## Account and plan

- One Cloudflare account for Blixis (ID stored as GitHub variable `CLOUDFLARE_ACCOUNT_ID`).
- **Workers Paid plan required** (Queues, Workflows, higher CPU limits, Hyperdrive usage at scale).
- A zone for the project domain is needed for custom domains (`api.<domain>`, `api.staging.<domain>`) and zone-level features (WAF rate limiting, cache purge). See [setup checklist](../setup-checklist.md#cloudflare).
- Deploys happen from **GitHub Actions**, not Workers Builds (Git integration), because migrations must run before each deploy.

## Resource inventory and naming

Pattern: `blixis-<resource>-<environment>`.

| Resource | Binding | Staging | Production | Introduced |
|---|---|---|---|---|
| Worker | — | `blixis-api-staging` | `blixis-api-production` | 004 |
| Hyperdrive config | `HYPERDRIVE` | `blixis-staging` | `blixis-production` | 005 |
| Queue (events) | `EVENTS` | `blixis-events-staging` | `blixis-events-production` | 006 |
| Dead-letter queue | — | `blixis-events-staging-dlq` | `blixis-events-production-dlq` | 006 |
| KV namespace (cache stamps) | `CACHE_KV` | `blixis-cache-staging` | `blixis-cache-production` | 013 |
| R2 bucket (assets) | `ASSETS` | `blixis-assets-staging` | `blixis-assets-production` | 014 |
| Workflow (release publish) | `PUBLISH_RELEASE` | `blixis-publish-release-staging` | `blixis-publish-release-production` | 016 |
| Rate limiter | `RATE_LIMITER_*` | per env | per env | 007 / 020 |
| Custom domain | — | `api.staging.<domain>` | `api.<domain>` | 004 / 021 |
| Docs Worker (static assets, single environment) | — | — | `blixis-docs` → https://blixis-docs.frosty-hill-6079.workers.dev | 023.004 |
| Sentry DSN | `SENTRY_DSN` (var) | staging DSN | production DSN | 004.007 |

Record every created resource ID in the inventory table in this file as plans create them (IDs are not secret, credentials are).

| Resource | Staging ID | Production ID |
|---|---|---|
| Hyperdrive | _tbd (005.003)_ | _tbd (005.003)_ |
| KV `CACHE_KV` | _tbd (013.002)_ | _tbd (013.002)_ |

Account ID: `7c871756de2f3f7dfa1445d5a88ca0fb` (GitHub variable `CLOUDFLARE_ACCOUNT_ID`). workers.dev subdomain: `frosty-hill-6079`.

### Developer docs Worker

- `apps/docs/wrangler.jsonc`: assets-only Worker `blixis-docs` serving `apps/docs/dist` (`404-page` not-found handling, trailing-slash HTML).
- Deploys from `.github/workflows/docs.yml` on pushes to `main` that touch the docs or packages, using the `docs` GitHub environment (branch policy: `main`). Secret `CLOUDFLARE_API_TOKEN` (scope: Account · Workers Scripts · Edit) must be added to that environment; until then the workflow builds and skips the deploy.
- Manual deploy: `pnpm --filter @blixis/docs deploy` (uses your local Wrangler login). Rollback: `pnpm --filter @blixis/docs exec wrangler rollback`.

## `wrangler.jsonc` structure

`apps/api/wrangler.jsonc` has a top-level (local) configuration and one block per deployed environment. Wrangler derives the Worker name `<name>-<env>` (`blixis-api-staging`, `blixis-api-production`).

> **Important:** `vars` and all bindings (`hyperdrive`, `queues`, `kv_namespaces`, `r2_buckets`, `workflows`, …) are **not inherited** by `env.*` blocks. Each environment must declare them all. A binding missing in one environment is a deploy-time bug — CI dry-runs both environments (004.006).

```jsonc
{
  "$schema": "../../node_modules/wrangler/config-schema.json",
  "name": "blixis-api",
  "main": "src/index.ts",
  "compatibility_date": "<pinned date>",
  "compatibility_flags": [],            // add "nodejs_compat" only if ADR 0006 requires it
  "observability": { "enabled": true },
  "upload_source_maps": true,

  // ── local development (wrangler dev) ─────────────────────────────
  "vars": { "BLIXIS_ENV": "local", "LOG_LEVEL": "debug" },
  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "<any id>", "localConnectionString": "postgres://blixis:blixis@localhost:5432/blixis" }
  ],
  "queues": {
    "producers": [{ "binding": "EVENTS", "queue": "blixis-events-local" }],
    "consumers": [{ "queue": "blixis-events-local", "max_batch_size": 10, "max_retries": 5 }]
  },
  "triggers": { "crons": ["* * * * *"] },   // outbox sweep, cleanup jobs (006)

  "env": {
    "staging": {
      "workers_dev": false,
      "routes": [{ "pattern": "api.staging.<domain>", "custom_domain": true }],
      "vars": { "BLIXIS_ENV": "staging", "LOG_LEVEL": "info" },
      "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<staging hyperdrive id>" }],
      "queues": {
        "producers": [{ "binding": "EVENTS", "queue": "blixis-events-staging" }],
        "consumers": [{ "queue": "blixis-events-staging", "max_batch_size": 10, "max_retries": 5,
                        "dead_letter_queue": "blixis-events-staging-dlq" }]
      },
      "triggers": { "crons": ["* * * * *"] }
    },
    "production": {
      "workers_dev": false,
      "preview_urls": false,
      "routes": [{ "pattern": "api.<domain>", "custom_domain": true }],
      "vars": { "BLIXIS_ENV": "production", "LOG_LEVEL": "info" },
      "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<production hyperdrive id>" }],
      "queues": {
        "producers": [{ "binding": "EVENTS", "queue": "blixis-events-production" }],
        "consumers": [{ "queue": "blixis-events-production", "max_batch_size": 10, "max_retries": 5,
                        "dead_letter_queue": "blixis-events-production-dlq" }]
      },
      "triggers": { "crons": ["* * * * *"] }
    }
  }
}
```

Exact keys and limits must be checked against current Wrangler docs when implementing (load the `wrangler` skill / docs).

## Type safety

- `pnpm --filter @blixis/api types` regenerates `apps/api/worker-configuration.d.ts` (committed) after every `wrangler.jsonc` change; CI runs `types:check` and fails if it is stale. `apps/api/src/env.ts` asserts the generated `Env` satisfies `ApiEnv` (task 004.002), so config and code cannot drift silently.
- **TypeScript 7 gotcha:** after the generated file changes, TS 7's incremental build info may not re-check `src/env.ts`; the `types` script therefore deletes `apps/api/tsconfig.tsbuildinfo`. CI always builds from scratch.
- Runtime validation of vars/secrets happens on first invocation (task 004.004).

## Compatibility date and flags

- Pin `compatibility_date`; bump it deliberately in its own PR (`build(api): bump compatibility date`) after running the Workers-pool tests.
- Each compatibility flag is justified in the PR and in `docs/decisions/` when architectural.

## Secrets

```bash
pnpm --filter @blixis/api exec wrangler secret put WEBHOOK_SECRET_KEY --env staging
pnpm --filter @blixis/api exec wrangler secret list --env production
```

- Local secrets in `apps/api/.dev.vars` (git-ignored); keep `.dev.vars.example` updated.
- Never put secrets in `wrangler.jsonc` `vars`.
- Hyperdrive stores the database credentials inside its configuration; the Worker never receives the Neon password directly. Create Hyperdrive configs from the Neon **direct** host (no `-pooler`), region `eu-central-1`, using the application role — never the owner role.
- Rotation procedures: `docs/operations/repository.md#secrets-rotation`.

## Local development

- `pnpm dev` runs `wrangler dev` for `apps/api` with local simulations of Queues, KV, R2, Cache, and Workflows (Miniflare).
- Hyperdrive locally uses `localConnectionString` (or the env var `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`) pointing at Docker Postgres.
- `wrangler dev --remote` is not used for day-to-day work (it touches real resources).

## CI access (API token)

Create one API token per environment (staging, production) scoped to the Blixis account, stored as the `CLOUDFLARE_API_TOKEN` secret in the matching GitHub environment. Required permissions (verify against current docs when creating):

- Account · Workers Scripts · Edit
- Account · Workers KV Storage · Edit
- Account · Workers R2 Storage · Edit
- Account · Queues · Edit
- Account · Hyperdrive · Edit
- Account · Workers Observability · Edit (if configuring via API)
- Account · Account Settings · Read
- Zone · Workers Routes · Edit (for custom domains/routes on the Blixis zone)

Resource creation (queues, buckets, Hyperdrive configs) is done once, manually or via a documented script, not on every deploy.

## Monitoring

- **Errors and alerts: Sentry** (org `private-m57`). The Worker reports unexpected errors (5xx, failed queue/cron/Workflow invocations) via `@sentry/cloudflare` with `environment` = `BLIXIS_ENV` and `release` = `BLIXIS_VERSION`; expected 4xx errors are not reported. `SENTRY_DSN` is configured per environment. Setup: task [004.007](../plans/004-cloudflare-worker-runtime/007-sentry-error-monitoring.md).
- Source maps are uploaded to Sentry on every deploy so stack traces are readable.

- Workers Logs/Traces enabled via `observability` (sampling per environment set in task 020.002).
- Also watch (Workers dashboard / Sentry alerts): 5xx rate, CPU time, queue backlog and DLQ depth, outbox backlog age, Hyperdrive errors. Runbook: `docs/operations/observability.md` (020.002).

## Rollback

```bash
pnpm --filter @blixis/api exec wrangler deployments list --env production
pnpm --filter @blixis/api exec wrangler rollback --env production
```

See [Release & deployment](./deployment.md#rollback).

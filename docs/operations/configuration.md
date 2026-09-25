# Configuration

Every variable, secret, and binding of the Blixis Workers. **Update this page in the same PR that adds or changes one** (and `apps/api/src/env.ts`, `wrangler.jsonc`, `.dev.vars.example`).

Related: [Environments](./environments.md) · [Cloudflare Workers](./cloudflare.md) · [GitHub Actions](./github-actions.md)

---

## How configuration is validated

- `apps/api/src/env.ts` declares `ApiEnv` (TypeScript) and `apiEnvSchema` (Zod).
- **Compile time:** `wrangler types` generates `Env` from `wrangler.jsonc`; `env.ts` asserts `Env` satisfies `ApiEnv`, and CI checks the generated file is current.
- **Runtime:** `createWorkerHandler(app, { envSchema })` validates the environment on the first invocation of each isolate. If it is invalid, every invocation fails: HTTP returns `500` with a generic `INFRASTRUCTURE_ERROR` problem, queue batches are retried, and cron runs fail. The log line `invalid Worker environment` names the invalid **keys** — never their values.

## API Worker (`apps/api`)

| Name | Kind | Required | local | staging | production | Description |
|---|---|---|---|---|---|---|
| `BLIXIS_ENV` | var | yes | `local` | `staging` | `production` | Deployment environment (`local` · `preview` · `staging` · `production`) |
| `LOG_LEVEL` | var | no | `debug` | `info` | `info` | Minimum log level (`debug` · `info` · `warn` · `error`) |
| `SENTRY_DSN` | var | no | unset (Sentry off) | project DSN | project DSN | Sentry ingest URL for `private-m57/blixis-api`. Not a secret. Unset = no events |
| `SENTRY_RELEASE` | var | no | unset | unset | `blixis-api@<version>` (set by the deploy job) | Sentry release. Unset = the `CF_VERSION_METADATA` version id |
| `HYPERDRIVE` | binding (Hyperdrive) | yes | Docker Postgres (`localConnectionString`) | `blixis-staging` | `blixis-production` | Postgres via Hyperdrive, read by `databaseModule()`. See [Database](./database.md) |
| `AUTH_SIGNING_KEYS` | **secret** | for auth routes | `.dev.vars` or `--var` (`pnpm auth:generate-key`) | per-env secret | per-env secret | JSON array of Ed25519 private JWKs; the first signs access tokens, all verify (ADR 0009). Missing → only `/auth/*` fails |
| `AUTH_ALLOWED_ORIGINS` | var | no | `http://localhost:5173` | `""` (no browser admin yet) | `""` | Comma-separated origins allowed for cookie-based refresh/sign-out (CSRF) |
| `EVENTS` | binding (Queue producer) | yes | `blixis-events-local` (simulated) | `blixis-events-staging` | `blixis-events-production` | Events queue. Used only through `@blixis/events` (`eventsQueueModule()` → `QUEUE_SENDER`), never directly (§15) |
| `CF_VERSION_METADATA` | binding (version metadata) | — | ✓ | ✓ | ✓ | Id/tag of the running Worker version; the release fallback |

Staging and production values are set in `env.staging` / `env.production` of `wrangler.jsonc` (task 004.006). Secrets are set with `wrangler secret put <NAME> --env <env>` and locally in `apps/api/.dev.vars` (git-ignored).

Planned additions: `CACHE_KV` (013), `ASSETS` R2 bucket (014), workflow bindings (016).

## Docs Worker (`apps/docs`)

Static assets only — no variables or secrets.

## CI (GitHub)

See [GitHub Actions → Secrets and variables](./github-actions.md#secrets-and-variables).

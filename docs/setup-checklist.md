# Project Setup Checklist

Things the project needs beyond code — accounts, settings, decisions, and files — collected in one place. Items marked **(owner)** need a decision or action by the project owner; the rest are done by the implementing tasks referenced.

Last updated: 2026-09-24 (after plan 001).

Related: [Repository settings](./operations/repository.md) · [Cloudflare Workers](./operations/cloudflare.md) · [Environments](./operations/environments.md) · [ROADMAP](./ROADMAP.md#open-architectural-decisions)

---

## Status at a glance

| Area | Status |
|---|---|
| GitHub repository | ✅ `blixis-io/monorepo`, **public** |
| GitHub CLI | ✅ authenticated |
| Cloudflare account + Wrangler | ✅ set up (Wrangler 4.x installed); docs site live on workers.dev |
| Neon project | ✅ created (region `eu-central-1`, Frankfurt) — follow-ups below |
| Sentry | 🟡 org `private-m57` chosen for alerts; agent plugin + project setup pending |
| Domain | ❌ not decided |
| Licence / npm scope | ❌ not decided — more urgent now that the repo is public |

## Git and GitHub

- [x] GitHub repository `blixis-io/monorepo` created and made **public**.
- [x] GitHub CLI authenticated (`gh auth status`).
- [x] Local Git identity set for this repo (`Michael <michael@voeten.online>`); commits are made with the maintainer's own account.
- [ ] **SSH commit signing** (recommended): `git config gpg.format ssh`, `git config user.signingkey ~/.ssh/<key>.pub`, `git config commit.gpgsign true`, and add the key to GitHub as a *signing* key. Then enable "require signed commits" on `main`.
- [x] Repository is public → rulesets, environments, environment secrets, and required reviewers are available on the free plan.
- [x] Merge settings and the `main` ruleset applied (squash-only, required `verify` + `pr-title`, linear history). Environments and the `v*` tag ruleset follow with plan 021 ([Repository settings](./operations/repository.md)).
- [ ] GitHub environments `staging` / `production` created (plan 021).
- [ ] Secret scanning with push protection enabled (free for public repos).
- [ ] Actions: require approval for workflows from first-time contributors / forks (public repo hygiene).
- [x] PR template (001.007).
- [ ] Issue templates, `CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md` (021.003).

## Conventions and tooling

- [x] Conventional Commit PR-title check (`pr-title.yml`, task 001.007).
- [x] Optional local hooks: commitlint + Biome via lefthook (`pnpm exec lefthook install`, task 001.005).
- [ ] release-please config + manifest + `CHANGELOG.md` (task 021.001).
- [ ] Dependency update bot — Renovate or Dependabot (task 021.003).
- [x] `.editorconfig`, `.nvmrc`, `packageManager` pin, `.gitignore` (task 001.001).
- [x] Formatter/linter/boundary tooling per ADR 0003 (tasks 001.002, 001.005).

## Cloudflare

- [x] Cloudflare account set up; Wrangler installed and logged in locally.
- [ ] **(owner)** Confirm the **Workers Paid** plan is active (required for Queues, Workflows, higher CPU limits).
- [x] Account ID added as GitHub variable `CLOUDFLARE_ACCOUNT_ID`.
- [x] Developer docs deployed: https://blixis-docs.frosty-hill-6079.workers.dev (Worker `blixis-docs`).
- [x] Cloudflare API token added as secret `CLOUDFLARE_API_TOKEN` in the GitHub **`docs`** environment — docs deploy automatically from `main`:
  ```bash
  gh secret set CLOUDFLARE_API_TOKEN --env docs --repo blixis-io/monorepo
  ```
- [ ] API tokens per environment with the permissions listed in [Cloudflare Workers](./operations/cloudflare.md#ci-access-api-token), stored as GitHub environment secrets.
- [ ] Resources created per environment (Hyperdrive, Queues + DLQ, KV, R2) as their plans arrive; IDs recorded in the inventory.
- [ ] Workers observability (logs/traces) enabled (task 020.002).

## Domains and DNS

- [ ] **(owner)** Decide the product domain (e.g. `blixis.io`) and add the zone to Cloudflare.
- [ ] Hostnames: `api.<domain>` (production), `api.staging.<domain>` (staging); later `assets.<domain>` for asset delivery (ADR 0013) and an admin hostname (ADR 0017).
- [ ] TLS/HSTS policy on the zone.

## Database (Neon)

- [x] Neon project created in `eu-central-1` (AWS Frankfurt); default database `neondb`.
- [ ] **(owner) Rotate the `neondb_owner` password.** The connection string was shared in plain text in a chat session. Never paste it into files in this public repository.
- [ ] Create branches `production` (primary) and `staging` (task 005.003).
- [ ] Create least-privilege roles per branch: an **application role** (DML only, used by Hyperdrive) and a **migration role** (DDL, used only by CI `db:migrate`). The owner role is not used by the application or CI.
- [ ] Use the **direct** host (without `-pooler`) for Hyperdrive configurations and migrations; Hyperdrive does its own pooling. Keep `sslmode=require`.
- [ ] Store migration URLs only as GitHub environment secrets (`DATABASE_URL` in `staging` / `production`) and local developer `.env`/`.dev.vars` (git-ignored).
- [ ] Point-in-time restore retention configured (task 022.002).
- [ ] Neon API key for preview branches (task 021.002).
- [ ] Keep Cloudflare Hyperdrive and Workers traffic close to the database (placement/Smart Placement evaluated in task 022.001).

## Sentry (errors and alerts)

- [x] **(owner)** Alert destination decided: **Sentry**, org `private-m57`.
- [ ] **(owner)** Install the Sentry agent plugin for your coding assistant — run it yourself in the terminal (it installs external code, so the assistant does not run it for you):
  ```bash
  npx @sentry/agent-plugin install private-m57#e6f8917e3a
  ```
- [ ] Create the Sentry project for the API (environments `staging`, `production`), and later one for the admin UI (plan 019).
- [ ] Store `SENTRY_DSN` per Worker environment; GitHub variables `SENTRY_ORG=private-m57`, `SENTRY_PROJECT`; secret `SENTRY_AUTH_TOKEN` for source-map uploads and release tracking.
- [ ] Integrate the SDK in the Worker (task [004.007](./plans/004-cloudflare-worker-runtime/007-sentry-error-monitoring.md)).
- [ ] Alert rules: new production issue, staging error spike, cron/uptime monitors (task 020.002).
- [ ] Route Sentry notifications to email or Slack.

## Packages and licensing

- [ ] **(owner)** Choose a licence. The repository is public; without a `LICENSE` file, nobody may legally reuse the code. Decide before external contributions (task 018.005).
- [ ] **(owner)** Secure the `@blixis` npm scope (npm org) if packages will be public.
- [ ] npm trusted publishing (OIDC) or automation token for the release workflow.

## Public repository hygiene

- [ ] Never commit secrets, connection strings, DSNs with auth tokens, or `.dev.vars` (`.gitignore` in task 001.001; push protection above).
- [ ] `SECURITY.md` with private vulnerability reporting enabled.
- [ ] Pull-request workflows use no secrets; deploy jobs run only on `main` / release tags in protected environments.

## Operations

- [x] **(owner)** Alert destination: Sentry (see above).
- [ ] **(owner)** SLOs and RPO/RTO targets (tasks 022.001/022.002).
- [ ] Status/incident process (lightweight: who responds, where it's communicated).
- [ ] Email provider decision for invitations/password reset (roadmap D11, deferred).

## Local developer machine

- [x] Node 24 LTS, pnpm, Docker, `gh`, Wrangler installed.
- [x] `corepack enable` so the pinned pnpm version from `package.json#packageManager` is used.
- [ ] Editor: TypeScript 7 language service support; formatter extension per ADR 0003; EditorConfig.

## Legal / product (later)

- [ ] Privacy policy and data processing terms before storing customer data.
- [ ] Data residency expectations (Neon is in the EU — `eu-central-1`; R2 location hints should match).

# Project Setup Checklist

Things the project needs beyond code — accounts, settings, decisions, and files — collected in one place. Items marked **(owner)** need a decision or action by the project owner; the rest are done by the implementing tasks referenced.

Related: [Repository settings](./operations/repository.md) · [Cloudflare Workers](./operations/cloudflare.md) · [Environments](./operations/environments.md) · [ROADMAP](./ROADMAP.md#open-architectural-decisions)

---

## Git and GitHub account

- [x] GitHub repository `blixis-io/monorepo` created (private).
- [x] GitHub CLI authenticated (`gh auth status`).
- [ ] Local Git identity set for this repo (`git config user.name/user.email`) — commits are made with the maintainer's own account.
- [ ] **SSH commit signing** (recommended): `git config gpg.format ssh`, `git config user.signingkey ~/.ssh/<key>.pub`, `git config commit.gpgsign true`, and add the key to GitHub as a *signing* key. Then enable "require signed commits" on `main`.
- [ ] **(owner)** Confirm the `blixis-io` org plan supports rulesets and environments on private repos (see [Repository settings](./operations/repository.md)).
- [ ] Repository settings, rulesets, environments applied ([Repository settings](./operations/repository.md)).
- [ ] Secret scanning with push protection enabled.
- [ ] PR template, issue templates, `CODEOWNERS`, `SECURITY.md`, `CONTRIBUTING.md` (task 001.007 / 021.003).

## Conventions and tooling

- [ ] Conventional Commit PR-title check (`pr-title.yml`, task 001.007).
- [ ] Optional local `commit-msg` hook (commitlint via lefthook, task 001.005).
- [ ] release-please config + manifest + `CHANGELOG.md` (task 021.001).
- [ ] Dependency update bot — Renovate or Dependabot (task 021.003).
- [ ] `.editorconfig`, `.nvmrc`, `packageManager` pin, `.gitignore` (task 001.001).
- [ ] Formatter/linter/boundary tooling per ADR 0003 (tasks 001.002, 001.005).

## Cloudflare

- [ ] **(owner)** Cloudflare account for Blixis; **Workers Paid** plan enabled.
- [ ] **(owner)** Account ID shared as GitHub variable `CLOUDFLARE_ACCOUNT_ID`.
- [ ] API tokens per environment with the permissions listed in [Cloudflare Workers](./operations/cloudflare.md#ci-access-api-token), stored as GitHub environment secrets.
- [ ] Resources created per environment (Hyperdrive, Queues + DLQ, KV, R2) as their plans arrive; IDs recorded in the inventory.
- [ ] Workers observability (logs/traces) enabled (task 020.002).

## Domains and DNS

- [ ] **(owner)** Decide the product domain (e.g. `blixis.io`) and add the zone to Cloudflare.
- [ ] Hostnames: `api.<domain>` (production), `api.staging.<domain>` (staging); later `assets.<domain>` for asset delivery (ADR 0013) and an admin hostname (ADR 0017).
- [ ] TLS/HSTS policy on the zone.

## Database (Neon)

- [ ] **(owner)** Neon account/project; region close to the primary user base.
- [ ] Branches `production` and `staging`; roles: application (DML) and migration (DDL) per branch (task 005.003).
- [ ] Point-in-time restore retention configured (task 022.002).
- [ ] Neon API key for preview branches (task 021.002).

## Packages and licensing

- [ ] **(owner)** Choose a licence (open source vs. proprietary) before publishing anything (task 018.005).
- [ ] **(owner)** Secure the `@blixis` npm scope (npm org) if packages will be public.
- [ ] npm automation token or trusted publishing (OIDC) configured for the release workflow.

## Operations

- [ ] **(owner)** Where alerts go (email, Slack, …) for deploy failures, 5xx spikes, DLQ depth (task 020.002).
- [ ] **(owner)** SLOs and RPO/RTO targets (task 022.001/022.002).
- [ ] Status/incident process (lightweight: who responds, where it's communicated).
- [ ] Email provider decision for invitations/password reset (roadmap D11, deferred).

## Local developer machine

- [ ] Node LTS + `corepack enable`, Docker, `gh`.
- [ ] `wrangler login` only if you deploy or inspect remote resources manually.
- [ ] Editor: TypeScript 7 language service support; formatter extension per ADR 0003; EditorConfig.

## Legal / product (later)

- [ ] Privacy policy and data processing terms before storing customer data.
- [ ] Data residency expectations (affects Neon region, R2 location hints).

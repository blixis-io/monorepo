# Getting Started

Local development setup for the Blixis monorepo.

> **Status:** the repository is in the planning phase. Commands below describe the target setup delivered by roadmap plans 001–005; sections marked *(from plan NNN)* become available once that plan is completed.

Related: [Monorepo](./monorepo.md) · [Git workflow](../conventions/git-workflow.md) · [Testing](../conventions/testing.md) · [Environments](../operations/environments.md)

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Node.js | Active LTS (pinned in `.nvmrc`) | tooling, tests |
| pnpm | pinned in `package.json#packageManager` (use `corepack enable`) | package manager |
| Git | ≥ 2.40 | version control |
| GitHub CLI (`gh`) | latest | PRs, CI, releases |
| Docker | latest | local Postgres |
| Wrangler | via workspace (`pnpm exec wrangler`) | Cloudflare Workers dev/deploy |

Optional: a Cloudflare account with access to the Blixis account (only needed for deploying or remote resources), Neon console access.

## First-time setup

```bash
git clone git@github.com:blixis-io/monorepo.git blixis
cd blixis

# Git identity for this repository (commits are made with your own account)
git config user.name  "Your Name"
git config user.email "you@example.com"

corepack enable
pnpm install
pnpm exec lefthook install   # optional: commit-msg (commitlint) + pre-commit (Biome) hooks
```

## Everyday commands

```bash
pnpm lint            # Biome lint + package boundary checks
pnpm format          # format everything (Biome)
pnpm check           # Biome format + lint + import sorting in one pass
pnpm typecheck       # TypeScript 7 build-mode type check
pnpm test            # all tests (needs local Postgres from plan 005)
pnpm build           # build all packages
```

## Run the API locally *(from plan 004/005)*

```bash
docker compose up -d postgres                  # local Postgres
cp apps/api/.dev.vars.example apps/api/.dev.vars   # fill in local values; never commit
pnpm db:migrate                                # apply module migrations (DATABASE_URL → local Postgres)
pnpm dev                                       # wrangler dev for apps/api → http://localhost:8787
curl -s localhost:8787/api/v1/health
```

Local Cloudflare resources (Queues, KV, R2, Cache) are simulated by Wrangler/Miniflare; Hyperdrive uses a local connection string that points at Docker Postgres. See [Cloudflare Workers](../operations/cloudflare.md#local-development).

## Create a first user *(from plan 007)*

```bash
pnpm auth:create-user --email you@example.com
```

## Working on a roadmap task

1. Pick the next task from [ROADMAP.md](../ROADMAP.md) whose dependencies are completed.
2. Create a branch: `git switch -c feat/<task-id>-<description>` (see [Git workflow](../conventions/git-workflow.md)).
3. Set the task status to `in-progress` in the task file and ROADMAP.
4. Implement, validate, review, update technical notes — then open a PR with a Conventional Commit title.

## Troubleshooting

| Symptom | Check |
|---|---|
| `pnpm install` refuses to run | Node/pnpm versions match `.nvmrc` / `packageManager`; `corepack enable` |
| Lint fails on imports | You imported a package's internals or used a relative cross-package path |
| Workers tests fail but Node tests pass | Global-scope I/O or Node-only APIs in Worker code |
| DB tests fail | `docker compose ps`; `DATABASE_URL` points at local Postgres |

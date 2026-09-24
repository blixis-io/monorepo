# GitHub Actions

CI/CD for `blixis-io/monorepo`. Workflows are created by roadmap tasks 001.007 (CI), 004.006 (dry-run), 021.001 (deploy/release), 021.002 (previews), 018.004 (extension contract), and 019.004 (admin e2e). This document is the target design they implement.

Related: [Release & deployment](./deployment.md) · [Environments](./environments.md) · [Repository settings](./repository.md) · [Testing](../conventions/testing.md)

---

## Workflows

| File | Trigger | Jobs | Purpose |
|---|---|---|---|
| `ci.yml` | `pull_request`, `push: main` | `verify` → `deploy-staging` (push to `main` only) | Quality gates; staging deploy after green gates |
| `pr-title.yml` | `pull_request` (opened, edited, synchronize) | `pr-title` | Enforce Conventional Commit PR titles |
| `release.yml` | `push: main`, `workflow_dispatch` (input `tag`) | `release` → `deploy-production` | release-please release PR/tag; production deploy of new or given tag |
| `preview.yml` *(021.002)* | `pull_request` | `preview`, `cleanup` | Per-PR preview environment |
| `extension-contract.yml` *(018.004)* | `pull_request` on `packages/**`, `modules/**` | `extension-contract` | Example plugin installed from tarballs still works |
| `admin-e2e` job *(019.004)* | `pull_request` on `apps/admin/**` | `admin-e2e` | Playwright editorial smoke |

## Shared setup (composite action)

`.github/actions/setup/action.yml` — used by every job:

```yaml
name: setup
description: Checkout-independent Node + pnpm setup with store cache
runs:
  using: composite
  steps:
    - uses: pnpm/action-setup@<sha>          # reads packageManager from package.json
    - uses: actions/setup-node@<sha>
      with:
        node-version-file: .nvmrc
        cache: pnpm
    - run: pnpm install --frozen-lockfile
      shell: bash
```

## `ci.yml` (sketch)

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}

jobs:
  verify:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:<neon major>
        env: { POSTGRES_USER: blixis, POSTGRES_PASSWORD: blixis, POSTGRES_DB: blixis }
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U blixis" --health-interval 5s --health-retries 10
    env:
      DATABASE_URL: postgres://blixis:blixis@localhost:5432/blixis
    steps:
      - uses: actions/checkout@<sha>
      - uses: ./.github/actions/setup
      - run: pnpm format:check
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
      - run: pnpm --filter @blixis/api exec wrangler deploy --dry-run --env staging --outdir dist/staging
      - run: pnpm --filter @blixis/api exec wrangler deploy --dry-run --env production --outdir dist/production

  deploy-staging:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    needs: verify
    runs-on: ubuntu-latest
    environment: { name: staging, url: https://api.staging.<domain> }
    concurrency: { group: deploy-staging, cancel-in-progress: false }
    steps:
      - uses: actions/checkout@<sha>
      - uses: ./.github/actions/setup
      - run: pnpm build
      - run: pnpm db:migrate
        env: { DATABASE_URL: '${{ secrets.DATABASE_URL }}' }
      - run: pnpm --filter @blixis/api exec wrangler deploy --env staging --var BLIXIS_VERSION:${{ github.sha }}
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
      - run: pnpm smoke --base-url ${{ vars.API_URL }}
        env: { SMOKE_API_TOKEN: '${{ secrets.SMOKE_API_TOKEN }}' }
```

Early in the roadmap (before plans 004/005 exist) only the `verify` steps that apply are enabled; steps are added by the tasks that introduce them.

## `pr-title.yml`

Validates the PR title against Conventional Commits (types and scopes from [commit messages](../conventions/commit-messages.md)) using a semantic-PR-title action (e.g. `amannn/action-semantic-pull-request`, pinned by SHA). Because PRs are squash-merged with the title as the commit header, this is the main enforcement point.

## `release.yml` (sketch)

```yaml
name: release
on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      tag: { description: 'Existing tag to (re)deploy to production, e.g. v0.4.1', required: true }

permissions:
  contents: write
  pull-requests: write

jobs:
  release:
    if: github.event_name == 'push'
    runs-on: ubuntu-latest
    outputs:
      release_created: ${{ steps.rp.outputs.release_created }}
      tag: ${{ steps.rp.outputs.tag_name }}
    steps:
      - id: rp
        uses: googleapis/release-please-action@<sha>
        with:
          config-file: release-please-config.json
          manifest-file: .release-please-manifest.json

  deploy-production:
    needs: release
    if: |
      always() &&
      ((github.event_name == 'push' && needs.release.outputs.release_created == 'true') ||
       github.event_name == 'workflow_dispatch')
    runs-on: ubuntu-latest
    environment: { name: production, url: https://api.<domain> }
    concurrency: { group: deploy-production, cancel-in-progress: false }
    permissions: { contents: read }
    env:
      TAG: ${{ github.event_name == 'workflow_dispatch' && inputs.tag || needs.release.outputs.tag }}
    steps:
      - uses: actions/checkout@<sha>
        with: { ref: '${{ env.TAG }}' }
      - uses: ./.github/actions/setup
      - run: pnpm build
      - run: pnpm db:migrate
        env: { DATABASE_URL: '${{ secrets.DATABASE_URL }}' }
      - run: pnpm --filter @blixis/api exec wrangler deploy --env production --var BLIXIS_VERSION:${{ env.TAG }}
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
      - run: pnpm smoke --base-url ${{ vars.API_URL }} --read-only
```

Deploying production in the same workflow avoids the limitation that events created with `GITHUB_TOKEN` do not trigger other workflows (see [Release & deployment](./deployment.md#release-tooling-release-please-recommended)).

## Secrets and variables

Configured per GitHub **environment** so staging jobs can never read production credentials.

| Name | Type | `staging` | `production` | Used by |
|---|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` | secret | staging token | production token | deploy jobs |
| `CLOUDFLARE_ACCOUNT_ID` | variable (repo) | same | same | deploy jobs |
| `DATABASE_URL` | secret | Neon `staging` branch, migration role, direct URL | Neon `production` branch, migration role, direct URL | `db:migrate` |
| `SMOKE_API_TOKEN` | secret | staging smoke token | production smoke token (read-only scope) | smoke tests |
| `API_URL` | variable | `https://api.staging.<domain>` | `https://api.<domain>` | smoke tests |
| `NEON_API_KEY` | secret (repo) | — | — | preview branches (021.002) |

Pull-request workflows use no secrets (forks and Dependabot PRs cannot access them anyway).

## Conventions

- **Pin third-party actions by commit SHA** (with the version in a comment); updates via Dependabot/Renovate.
- **Least-privilege `permissions`** at workflow level (`contents: read`), elevated per job only where needed.
- **Concurrency:** cancel superseded PR runs; **never cancel deploy jobs** (they may be mid-migration).
- **Job names are stable** — they are referenced as required status checks (see [Repository settings](./repository.md#rulesets)). Renaming a job requires updating the ruleset.
- **Caching:** pnpm store via `setup-node`; no caching of `node_modules`.
- **Timeouts:** set `timeout-minutes` on every job (e.g. 20 for verify, 15 for deploys).
- **No AI attribution** in workflow-generated commits or release notes.

## Useful commands

```bash
gh run list --limit 10
gh run watch
gh run view --log-failed
gh workflow run release.yml -f tag=v0.4.1   # redeploy/rollback production to a tag
```

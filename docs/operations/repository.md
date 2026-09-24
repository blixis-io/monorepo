# Repository Settings

GitHub configuration for [`blixis-io/monorepo`](https://github.com/blixis-io/monorepo) (**public**). Roadmap task 021.003 finalises and verifies these settings; most can be applied as soon as the first CI workflow exists (task 001.007).

Related: [Git workflow](../conventions/git-workflow.md) · [GitHub Actions](./github-actions.md) · [Environments](./environments.md) · [Setup checklist](../setup-checklist.md)

---

> **Public repository:** rulesets, environments, environment secrets, required reviewers, secret scanning, and GitHub-hosted Actions minutes are available on the free plan. Public also means: never commit secrets, require approval for workflows from first-time contributors, and never expose secrets to pull-request workflows.

## General

| Setting | Value |
|---|---|
| Default branch | `main` |
| Allow squash merging | ✅ (default message: PR title and description) |
| Allow merge commits | ❌ |
| Allow rebase merging | ❌ |
| Always suggest updating PR branches | ✅ |
| Automatically delete head branches | ✅ |
| Allow auto-merge | ✅ (merges when required checks pass) |
| Issues | ✅ · Wiki ❌ · Projects optional |

```bash
gh repo edit blixis-io/monorepo \
  --default-branch main \
  --enable-squash-merge \
  --enable-merge-commit=false \
  --enable-rebase-merge=false \
  --delete-branch-on-merge \
  --enable-auto-merge
```

## Rulesets

### `main` branch

**Applied 2026-09-24** (ruleset `main`, id 23927099).


- Require a pull request before merging (required approvals: **0** while there is a single maintainer — GitHub does not allow approving your own PR; raise to 1 when collaborators join).
- Require status checks to pass, branches up to date: `verify`, `pr-title` (GitHub Actions app as the required source; later: `extension-contract`, `admin-e2e`).
- Allowed merge method: squash only.
- Require linear history.
- Block force pushes and deletions.
- Require signed commits: recommended once SSH signing is set up (see [setup checklist](../setup-checklist.md#git-and-github-account)).
- Bypass: repository admins in *pull request* mode only (emergency merge through a PR, never a direct push); every bypass is noted in the PR.

### Tags `v*`

- Restrict creation/update/deletion of `v*` tags to the release workflow (GitHub Actions) and admins, so production versions cannot be created by accident.

## Environments

| Environment | Deployment branches/tags | Protection | Secrets / variables |
|---|---|---|---|
| `staging` | `main` only | none (auto-deploy) | see [GitHub Actions](./github-actions.md#secrets-and-variables) |
| `production` | tags `v*` (and `main` for the release job if required by the workflow ref) | optional required reviewer (you) | see [GitHub Actions](./github-actions.md#secrets-and-variables) |
| `preview` *(021.002)* | all branches | none | Neon API key, preview Cloudflare token |

```bash
gh api -X PUT repos/blixis-io/monorepo/environments/staging
gh api -X PUT repos/blixis-io/monorepo/environments/production
gh secret set CLOUDFLARE_API_TOKEN --env staging    --repo blixis-io/monorepo
gh secret set CLOUDFLARE_API_TOKEN --env production --repo blixis-io/monorepo
gh variable set CLOUDFLARE_ACCOUNT_ID --repo blixis-io/monorepo --body "<account id>"
```

## Actions settings

- Workflow permissions: **read repository contents** by default.
- Allow GitHub Actions to **create and approve pull requests**: ✅ (needed by release-please to open the release PR).
- Allowed actions: GitHub-owned + selected verified creators, or "all actions" with SHA pinning enforced by review.
- Fork pull request workflows: **require approval for all outside collaborators**; fork PRs never receive secrets.

## Security

- Secret scanning + **push protection**: ✅
- Dependabot alerts and security updates: ✅
- Private vulnerability reporting: ✅ (with `SECURITY.md`)
- Code scanning (CodeQL for JavaScript/TypeScript): recommended once code exists.

## Repository files (created during setup)

| File | Purpose |
|---|---|
| `.github/pull_request_template.md` | PR checklist (task link, validation, migrations, breaking changes, docs/roadmap updated) |
| `.github/ISSUE_TEMPLATE/` | bug report, feature request, task |
| `.github/CODEOWNERS` | `* @EmVeeNL` initially |
| `.github/dependabot.yml` or `renovate.json` | dependency updates (021.003) |
| `SECURITY.md` | how to report vulnerabilities (required for a public repo) |
| `CONTRIBUTING.md` | short pointer to the docs in `docs/conventions/` |
| `LICENSE` | once the licence is decided (018.005) |

## Secrets rotation

| Secret | Where | Rotate | Procedure |
|---|---|---|---|
| `CLOUDFLARE_API_TOKEN` (per env) | GitHub environment secrets | yearly or on exposure | create new token → update secret → verify deploy → revoke old |
| Neon migration role password | GitHub `DATABASE_URL` | yearly or on exposure | reset in Neon → update secret → run `db:status` |
| Neon app role password | Hyperdrive config | yearly or on exposure | reset in Neon → `wrangler hyperdrive update` → verify readiness |
| Worker secrets (`WEBHOOK_SECRET_KEY`, auth) | `wrangler secret` | per ADR (key versioning required for encryption keys) | documented in the owning task |
| Smoke tokens | GitHub environment secrets | yearly | re-issue via API, update secret |
| `SENTRY_AUTH_TOKEN` | GitHub repository secret | yearly or on exposure | create org token in Sentry → update secret → revoke old |
| Neon owner password | Neon console only | **now** (was shared in chat), then on exposure | reset in Neon; owner role is never used by app or CI |

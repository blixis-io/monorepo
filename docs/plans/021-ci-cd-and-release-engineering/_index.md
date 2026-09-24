# 021 — CI/CD & Release Engineering

## Status

```text
not-started
```

Milestone: Milestone 9 — Production readiness  
Roadmap scope: MVP / initial platform  
Progress: 0/3 tasks completed

## Objective

Every merge to `main` deploys to staging safely (migrations first, backward-compatible), every released version (`vX.Y.Z`, cut by merging the release-please PR) deploys to production with a tested rollback, pull requests get isolated preview environments, and quality gates cannot be bypassed. (Package versioning/publishing lives in 018.005 because it depends on the extension contract gate.)

## Why this plan exists

§13/§20 module migrations must run outside the Worker; §46 one Worker simplifies deployment; §52 continuous proof requires gates that cannot be skipped. Earlier plans created dry-run and manual procedures (004.006, 005.005, 011.007); this plan makes them automated and repeatable. It can run in parallel with milestones M6–M8 once plan 011 is complete.

## Scope

In scope:

- staging deploy job (on `main`) and release workflow with production deploy (on version) per `docs/operations/deployment.md` and `docs/operations/github-actions.md`
- release-please configuration, `CHANGELOG.md`, version exposure (`BLIXIS_VERSION`)
- migration step (direct Neon connection with migration role) before deploy; expand/contract enforcement
- PR preview environments (Neon branch + Worker preview version) — if feasible
- required status checks, branch protection, dependency update automation, secrets rotation runbook

Out of scope:

- multi-region/multi-account deployments
- npm package publishing (018.005)
- admin UI separate hosting pipelines beyond ADR 0017 choice (included only if admin is a separate deployable)

## Dependencies

Depends on:

- [011 — Entries, Versions & Publishing](../011-entries-and-publishing/_index.md)

## Architecture decisions

- **Migrations run from CI** against the target Neon branch using the migration role, before `wrangler deploy` (005.005 policy).
- **Backward-compatible migrations** (expand/contract) so the previous Worker version keeps working during and after migration (enables rollback).
- **Environments**: `main` = staging; released versions (`vX.Y.Z` tags) = production (decided 2026-09-24, `docs/operations/environments.md`).
- **Release tooling**: release-please driven by Conventional Commits; production deploy runs as a dependent job in the release workflow because `GITHUB_TOKEN`-created releases do not trigger other workflows.
- **Rollback** = `wrangler rollback` or redeploy the previous tag via `workflow_dispatch`; migrations are not auto-reverted.
- **Gates are mandatory**: required status checks are enforced by branch protection; the list grows as plans add gates (extension-contract, admin e2e).
- **Secrets** only in CI secret store and Cloudflare; never in repo.

## Deliverables

- `deploy-staging` job in `ci.yml`; `.github/workflows/release.yml` (release-please + `deploy-production`); `preview.yml` (if feasible).
- `docs/operations/deployment.md` (deploy, migrate, rollback, secrets rotation).
- `docs/operations/repository.md` (branch protection, required checks, dependency updates, secrets rotation).

## Tasks

- [ ] [001 — Automate staging deploys from main and production deploys from versions](./001-staging-and-production-deploy-pipelines.md)
- [ ] [002 — Add pull request preview environments](./002-pull-request-preview-environments.md)
- [ ] [003 — Configure required checks, branch protection, and dependency update automation](./003-repository-governance-and-dependency-updates.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] A merge to `main` deploys staging with migrations automatically; merging a release PR creates `vX.Y.Z` and deploys it to production; rollback to the previous tag rehearsed once.
- [ ] Branch protection enforced with the current required checks; dependency update PRs run the full gate.

## Risks

- **Migration failures mid-deploy**: deploy must stop before Worker rollout if migration fails.
- **Preview environment cost/limits** (Neon branches, Hyperdrive configs per PR) — may need a shared preview Hyperdrive or skip Hyperdrive in previews.
- **Gate drift**: required-check names change when workflows are renamed; keep the list in `docs/operations/repository.md` in sync.

## Open questions

- GitHub is assumed as the host (001.007); confirm before applying branch protection.
- Preview environments: worth the complexity for MVP? Default: yes if Neon branching + Hyperdrive per preview is feasible; otherwise previews use staging DB branch read-only (document).

## Technical notes

No technical notes yet.

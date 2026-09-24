# 021.001 — Automate staging deploys from main and production deploys from versions

## Status

```text
not-started
```

## Parent plan

[021 — CI/CD & Release Engineering](./_index.md)

## Objective

Add the `deploy-staging` job (every merge to `main`) and the release workflow (release-please release PR → tag `vX.Y.Z` → `deploy-production` job), each running module migrations first and a post-deploy smoke test, plus a `workflow_dispatch` path to redeploy any existing tag.

## Background

004.006 dry-run; 005.005 migration CLI; 011.007 smoke script. Target design: `docs/operations/deployment.md`, `docs/operations/github-actions.md`, `docs/operations/environments.md`.

## Requirements

- `deploy-staging` job in `ci.yml` (needs `verify`, push to `main` only, environment `staging`, non-cancelling concurrency): build → `pnpm db:migrate` (staging `DATABASE_URL`, migration role) → `wrangler deploy --env staging --var BLIXIS_VERSION:<sha>` → smoke (`/health/ready`, content smoke) → on failure `wrangler rollback --env staging` and fail.
- release-please: `release-please-config.json`, `.release-please-manifest.json` (start at `0.1.0`), `CHANGELOG.md`; release PR titled `chore(release): …`.
- `release.yml`: `release` job (release-please) → `deploy-production` job when `release_created` (environment `production`, optional required reviewer), checking out the new tag; same steps against production with `BLIXIS_VERSION:vX.Y.Z`; `workflow_dispatch` input `tag` redeploys an existing tag (rollback path).
- Expose `BLIXIS_VERSION` in `GET /api/v1/health` and GraphQL `_platform.version`.
- Secrets management documented (CLOUDFLARE_API_TOKEN scoped minimally, DATABASE_URL per env, smoke tokens).
- `docs/operations/deployment.md`.

## Architectural constraints

- Migration role credentials never available to the Worker.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
.github/workflows/release.yml
release-please-config.json
.release-please-manifest.json
CHANGELOG.md
```

### Modify

```text
.github/workflows/ci.yml
apps/api/src/env.ts
packages/kernel/src/internal/rest.ts (version in health response)
docs/operations/deployment.md
docs/operations/github-actions.md
tooling/smoke/package.json
docs/operations/cloudflare.md
docs/operations/database.md
```

### Delete

```text
None.
```

## Implementation steps

1. `deploy-staging` job.
2. release-please configuration.
3. `release.yml` with `deploy-production` and `workflow_dispatch` redeploy.
4. Cut `v0.1.0`, verify production deploy; rehearse rollback to a previous tag.
5. Update docs to match the implementation.

## Dependencies

Requires:

- [011.007 — Verify the content management vertical slice end to end](../011-entries-and-publishing/007-content-vertical-slice-end-to-end.md)

## Acceptance criteria

- [ ] Merge to `main` results in staging deploy with migrations and smoke.
- [ ] Merging the release PR creates tag `vX.Y.Z`, a GitHub Release, and a production deploy of exactly that tag.
- [ ] `GET /api/v1/health` on production reports the released version.
- [ ] Redeploy of the previous tag via `workflow_dispatch` rehearsed once (recorded).

## Validation

- Observe workflow runs; record version IDs in Technical notes.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] API token scopes minimal and documented.

## Completion conditions

Change the status to `completed` only when all of the following hold:

1. Implementation is finished and every requirement above is met.
2. Every acceptance criterion is checked.
3. All validation steps pass.
4. The task has passed through `review` and every review checklist item is checked.
5. `Technical notes` are updated with findings from implementation, testing, and review.
6. `Files and folders` reflects the actual change set.
7. The task checkbox and status are updated in [`docs/ROADMAP.md`](../../ROADMAP.md).
8. The parent [`_index.md`](./_index.md) task list, progress count, and plan status are updated (plan becomes `completed` only when all tasks are completed and the plan completion criteria hold).

## Technical notes

No technical notes yet.

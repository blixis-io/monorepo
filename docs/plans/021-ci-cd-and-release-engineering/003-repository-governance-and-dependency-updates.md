# 021.003 — Configure required checks, branch protection, and dependency update automation

## Status

```text
not-started
```

## Parent plan

[021 — CI/CD & Release Engineering](./_index.md)

## Objective

Make CI gates mandatory and keep dependencies current: document and apply branch protection with required status checks (ci and Workers dry-run now; extension-contract and admin e2e once plans 018/019 add them), configure automated dependency updates grouped by risk, and write the secrets rotation runbook.

## Background

§52 continuous proof only works if gates cannot be bypassed; §38 dependency rules require deliberate updates (Workers compatibility, TS7 support) rather than blind upgrades.

## Requirements

- Branch protection on `main`: PR required, required checks listed, no force-push; tag ruleset for `v*`; update `docs/operations/repository.md` (already written as the target design) and apply via GitHub settings or `gh api`.
- Dependency update bot (Renovate or Dependabot — decide) with groups: Cloudflare tooling (wrangler, workers types, vitest pool) together; TypeScript separately (TS7 upgrades reviewed manually); production dependencies weekly; lockfile maintenance.
- Every dependency PR runs the full gate including Workers dry-run and extension-contract.
- Secrets rotation runbook: Cloudflare API token, Neon roles, `WEBHOOK_SECRET_KEY`, auth secrets — frequency and procedure.

## Architectural constraints

- Automated merges only for dev-dependency patch updates, never for runtime Worker dependencies.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
renovate.json (or .github/dependabot.yml)
.github/CODEOWNERS
SECURITY.md
CONTRIBUTING.md
```

### Modify

```text
docs/operations/repository.md
docs/operations/deployment.md
```

### Delete

```text
None.
```

## Implementation steps

1. Decide bot and grouping.
2. Configure and document branch protection.
3. Write secrets rotation runbook.

## Dependencies

Requires:

- [021.001 — Automate staging deploys from main and production deploys from versions](./001-staging-and-production-deploy-pipelines.md)

## Acceptance criteria

- [ ] A PR with a failing required check cannot be merged (verified once).
- [ ] First dependency update PRs open and run the full gate.

## Validation

- Inspect branch protection via `gh api repos/:owner/:repo/branches/main/protection`.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Required checks list matches existing workflow job names.

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

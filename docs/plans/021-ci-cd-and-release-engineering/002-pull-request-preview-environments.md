# 021.002 — Add pull request preview environments

## Status

```text
not-started
```

## Parent plan

[021 — CI/CD & Release Engineering](./_index.md)

## Objective

Provide per-PR preview deployments (Worker preview version/alias) connected to an isolated Neon branch with migrations applied, torn down on PR close — or document a justified simpler alternative.

## Background

Neon branching makes per-PR databases cheap; Workers supports preview versions/URLs. Hyperdrive config per branch may be needed.

## Requirements

- Feasibility check (Hyperdrive per preview vs. direct connection in preview, Workers preview URLs with bindings).
- Implement workflow `preview.yml`: create Neon branch → migrate → upload Worker version with preview alias → comment URL on PR → cleanup on close.
- If infeasible, document alternative and set task outcome accordingly (not silently skipped).

## Architectural constraints

- Preview environments never touch production data.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
.github/workflows/preview.yml
```

### Modify

```text
docs/operations/deployment.md
```

### Delete

```text
None.
```

## Implementation steps

1. Feasibility check.
2. Workflow.
3. Cleanup automation.

## Dependencies

Requires:

- [021.001 — Automate staging deploys from main and production deploys from versions](./001-staging-and-production-deploy-pipelines.md)

## Acceptance criteria

- [ ] A PR gets a working preview URL with its own database branch; closing the PR removes both.

## Validation

- Open a test PR and verify.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Cost/limits noted.

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

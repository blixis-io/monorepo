# 022.002 — Implement and drill backup, restore, and disaster recovery

## Status

```text
not-started
```

## Parent plan

[022 — Production Readiness & Launch](./_index.md)

## Objective

Define RPO/RTO, configure Neon retention/PITR, define R2 retention/recovery policy, write DR runbooks, and perform a restore drill on staging.

## Background

§13 Postgres source of truth; §17 R2 binaries with Postgres metadata.

## Requirements

- Neon: history retention window configured per environment; restore procedure via branch-from-point-in-time; Hyperdrive re-pointing steps.
- R2: policy for deleted assets (delayed hard delete window in 014.006 or bucket versioning/replication if available) — decide and implement config.
- Consistency: procedure to reconcile asset metadata vs. R2 objects after restore (script).
- Drill: restore staging DB to a point in time, re-point, verify content and assets, measure RTO.
- `docs/operations/disaster-recovery.md`.

## Architectural constraints

- Drill on staging only.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/operations/disaster-recovery.md
tooling/db/src/commands/reconcile-assets.ts
```

### Modify

```text
docs/operations/database.md
modules/assets/src/module.ts (retention config, if changed)
```

### Delete

```text
None.
```

## Implementation steps

1. Define RPO/RTO.
2. Configure retention.
3. Reconciliation script.
4. Drill and report.

## Dependencies

Requires:

- [022.001 — Define performance targets and run load tests](./001-performance-and-load-testing.md)

## Acceptance criteria

- [ ] Drill report shows achieved RTO/RPO within targets.

## Validation

- Execute the drill; attach timings in Technical notes.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Runbook executable by someone other than the author.

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

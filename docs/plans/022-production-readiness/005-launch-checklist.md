# 022.005 — Execute the launch checklist

## Status

```text
not-started
```

## Parent plan

[022 — Production Readiness & Launch](./_index.md)

## Objective

Create and execute the go-live checklist for production: configuration, secrets, DNS/custom domains, bindings, migrations, monitoring/alerts, rate limits, backups, security sign-off, documentation, rollback plan — then deploy production and verify.

## Background

Aggregates all previous readiness work into one executable procedure.

## Requirements

- `docs/operations/launch-checklist.md` with owner, evidence link, and status per item.
- Production resources verified (Hyperdrive, Queues, DLQ, KV, R2, crons, Workflows if 016 shipped).
- Production deploy via 021.001 workflow; post-deploy smoke; monitoring watch period.
- Update ROADMAP milestone M9 and MVP status.

## Architectural constraints

- Go-live requires explicit project-owner approval.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/operations/launch-checklist.md
```

### Modify

```text
docs/ROADMAP.md
```

### Delete

```text
None.
```

## Implementation steps

1. Write checklist.
2. Execute items with evidence.
3. Owner approval.
4. Production deploy and verification.

## Dependencies

Requires:

- [022.002 — Implement and drill backup, restore, and disaster recovery](./002-backup-restore-and-disaster-recovery.md)
- [022.004 — Perform the architecture conformance review](./004-architecture-conformance-review.md)

## Acceptance criteria

- [ ] Every checklist item has evidence and is complete.
- [ ] Production smoke passes.

## Validation

- Execute production smoke (`tooling/smoke`) against production with a dedicated test space.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Rollback plan rehearsed (from 021.001) and referenced.

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

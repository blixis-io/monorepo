# 022.004 — Perform the architecture conformance review

## Status

```text
not-started
```

## Parent plan

[022 — Production Readiness & Launch](./_index.md)

## Objective

Review the implemented system against `docs/BLIXIS_ARCHITECTURE.md` principles and §48 agent rules, record violations and drift, fix blockers, and update the architecture document if deliberate decisions (ADRs) changed it.

## Background

§52 final constraint; §49 questions; checkpoints CP1–CP7 recorded along the way.

## Requirements

- Checklist over §2 principles, §4 package responsibilities, §24–§26 boundaries/validation, §28–§35 cross-cutting rules, §46 monolith, §47 non-goals.
- Automated evidence: boundary lint, extension contract gate, isolation/authz suites, dependency graph export.
- Update `docs/BLIXIS_ARCHITECTURE.md` with a "Decisions log" section linking ADRs (only where the project owner approves architecture doc edits).
- Follow-up backlog created as new plans/tasks in ROADMAP deferred section.

## Architectural constraints

- Architecture edits require explicit owner approval (the architecture doc is the source of truth).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/architecture/conformance-review.md
```

### Modify

```text
docs/ROADMAP.md
docs/BLIXIS_ARCHITECTURE.md (only with owner approval)
```

### Delete

```text
None.
```

## Implementation steps

1. Collect evidence.
2. Review and record.
3. Fix blockers.
4. Update roadmap/backlog.

## Dependencies

Requires:

- [022.003 — Publish documentation and API reference](./003-documentation-and-api-reference.md)

## Acceptance criteria

- [ ] Conformance report complete with no open blocking violations.

## Validation

- Review report against the checklist.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Every checkpoint CP1–CP7 has recorded evidence.

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

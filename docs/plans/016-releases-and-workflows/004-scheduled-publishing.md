# 016.004 — Implement scheduled release publishing

## Status

```text
not-started
```

## Parent plan

[016 — Releases & Cloudflare Workflows](./_index.md)

## Objective

Allow scheduling a release for a future time and publish it automatically via the approach chosen in ADR 0014 (Workflow `sleepUntil` or cron scan), with cancel/reschedule.

## Background

§16 lists scheduled publishing as a Workflow candidate.

## Requirements

- `POST /api/v1/releases/:id/schedule { at }`, `DELETE /api/v1/releases/:id/schedule`.
- Implementation per ADR 0014; cancellation must prevent publishing (terminate instance or check status at wake-up).
- Time zone handling: store UTC; API accepts ISO 8601 with offset.
- Tests: schedule → publish at time (time-travel/fake clock where possible); cancel prevents publish.

## Architectural constraints

- No double publish on reschedule (idempotency by release + schedule version).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/releases/src/application/scheduling.ts
modules/releases/test/scheduling.test.ts
```

### Modify

```text
modules/releases/src/rest/routes.ts
modules/releases/src/workflows/publish-release.ts
modules/releases/src/module.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Scheduling service.
2. Routes.
3. Tests.

## Dependencies

Requires:

- [016.003 — Implement the publish-release Workflow](./003-publish-release-workflow.md)

## Acceptance criteria

- [ ] Cancelled schedule never publishes.
- [ ] Rescheduled release publishes once at the new time.

## Validation

```bash
pnpm test --filter @blixis/releases
```

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Clock handling uses `RequestContext.now()` for testability.

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

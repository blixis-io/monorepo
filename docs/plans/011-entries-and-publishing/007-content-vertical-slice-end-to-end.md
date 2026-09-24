# 011.007 — Verify the content management vertical slice end to end

## Status

```text
not-started
```

## Parent plan

[011 — Entries, Versions & Publishing](./_index.md)

## Objective

Run and document the complete content workflow end to end in the Workers pool and on staging: create space → content type → entry → update → publish → event consumed by a test subscriber → unpublish → delete, with isolation and authz coverage.

## Background

Architectural checkpoint CP5 validates the kernel/database/events/tenancy/authz design against a real domain before delivery APIs and extensions are layered on.

## Requirements

- Workers-pool scenario test covering the full workflow with a test subscription asserting `entry.published` delivery.
- Staging run via a script (`tooling/smoke/content-smoke.ts`) using a personal API token; records timings.
- Review against §48 agent rules (no internal imports, no business logic in handlers, services used by all transports).
- Update ROADMAP checkpoint CP5 with findings.

## Architectural constraints

- Smoke script uses only public REST API.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/api/test/content-workflow.worker.test.ts
tooling/smoke/package.json
tooling/smoke/src/content-smoke.ts
```

### Modify

```text
package.json
docs/ROADMAP.md
```

### Delete

```text
None.
```

## Implementation steps

1. Scenario test.
2. Smoke script.
3. Architecture review and notes.

## Dependencies

Requires:

- [011.006 — Implement entry references and link resolution](./006-references-and-link-resolution.md)

## Acceptance criteria

- [ ] Scenario test passes.
- [ ] Staging smoke passes (or blocked with documented Blocker).
- [ ] CP5 findings recorded.

## Validation

```bash
pnpm --filter @blixis/api test
BLIXIS_API_URL=... BLIXIS_TOKEN=... pnpm smoke:content
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
- [ ] Architectural review findings are either fixed or turned into follow-up tasks.

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

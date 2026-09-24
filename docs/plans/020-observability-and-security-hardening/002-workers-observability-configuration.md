# 020.002 — Configure Workers observability and write the observability runbook

## Status

```text
not-started
```

## Parent plan

[020 — Observability & Security Hardening](./_index.md)

## Objective

Configure Workers Logs (and traces where available) per environment with sampling, verify end-to-end correlation on staging, and document dashboards/queries and alerting approach.

## Background

§35; Cloudflare Workers observability features (verify current capabilities and pricing).

## Requirements

- `wrangler.jsonc` `observability` settings per environment (sampling rates).
- Staging verification: trace one publish operation across request → outbox → queue → invalidation → webhook by `correlationId`; record steps.
- `docs/operations/observability.md`: log fields, example queries, error budgets/alerts (e.g. queue DLQ depth, outbox backlog age, 5xx rate, readiness failures). Alerts are delivered through **Sentry** (org `private-m57`, integrated in 004.007): tune issue/spike alert rules, add cron/uptime monitors for scheduled jobs and readiness, decide Sentry performance tracing sample rates.
- Health and backlog metrics endpoint for internal use (e.g. outbox backlog age in readiness details, auth-protected) — optional; decide.

## Architectural constraints

- Sampling must not drop error logs.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/operations/observability.md
```

### Modify

```text
apps/api/wrangler.jsonc
docs/operations/cloudflare.md
```

### Delete

```text
None.
```

## Implementation steps

1. Configure observability.
2. Staging trace exercise.
3. Runbook.

## Dependencies

Requires:

- [020.001 — Implement structured logging, redaction, and correlation propagation](./001-structured-logging-and-correlation.md)

## Acceptance criteria

- [ ] Staging trace exercise documented with log excerpts (redacted).

## Validation

- Perform the staging trace exercise and attach findings in Technical notes.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Alert conditions cover queues, outbox, DB, and error rates.

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

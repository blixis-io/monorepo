# 020.002 — Configure Workers observability and write the observability runbook

## Status

```text
in-progress
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
apps/api/src/index.ts
apps/api/src/blixis.config.ts
packages/kernel/src/error-reporter.ts
packages/events/src/consumer.ts
packages/events/src/consumer.test.ts
packages/events/src/module.ts
packages/events/src/outbox/dispatch.ts
packages/events/src/outbox/module.ts
packages/events/src/outbox/outbox.test.ts
modules/webhooks/src/application/deliver.ts
docs/operations/cloudflare.md
docs/api-surface/kernel.api.md
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

- [x] Implementation matches this task specification (requirements and constraints).
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

- `observability` is declared per environment (wrangler does not inherit it reliably across envs, and the values differ). Logs: `head_sampling_rate: 1` everywhere, because head sampling drops whole invocations and so would drop error lines (constraint). Traces: 1 in staging, 0.1 in production, matching Sentry `tracesSampleRate`.
- Alerts need a signal that reaches Sentry, and log lines don't. So the conditions the task names became Sentry events raised in code:
  - DLQ: the consumer knows the queue's `max_retries` (`eventsModule({ maxRetries })`, 5 in `apps/api`) and reports the last failed attempt as `EventDeadLettered`, and logs `event.dead_lettered`.
  - Outbox backlog: a row reaching `OUTBOX_ALERT_ATTEMPTS` is reported once as `OutboxStuck`.
  - Cron health: `Sentry.withMonitor('blixis-api-cron', …)` around `scheduled`, which upserts the monitor (crontab from `controller.cron`, margin 2 min, max runtime 5 min, issue after 3 consecutive failures).
  - Readiness and 5xx: Sentry uptime monitor (owner, UI) and the existing 5xx reporting.
- `ErrorReportContext` gained `eventId` and `eventType` (kernel API surface).
- For the trace exercise the path needed two more log facts: `event.consumed` now lists the `ok` subscriptions (so the cache-invalidation and webhook fan-out subscriptions are visible), and webhooks log one `webhooks.attempt` line per attempt (never the URL).
- Metrics endpoint: decided against (reasons in the runbook, "Why no metrics endpoint").
- **Open:** the staging trace exercise needs a staging deploy (owner). The procedure is in the runbook; the acceptance criterion is checked when its Record section is filled in.

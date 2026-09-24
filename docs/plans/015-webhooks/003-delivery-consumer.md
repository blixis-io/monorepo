# 015.003 — Deliver webhooks with signatures, timeouts, and retries

## Status

```text
not-started
```

## Parent plan

[015 — Webhooks](./_index.md)

## Objective

Consume `webhook.delivery.requested`, perform the signed HTTP POST with timeout, record the outcome, and schedule retries with exponential backoff; emit `webhook.delivery.completed` / `webhook.delivery.failed`; auto-disable endpoints after sustained failure.

## Background

§15 webhook delivery via Queue; §33 retries/idempotency; §12 Web Platform `fetch`.

## Requirements

- Signature: `Blixis-Signature: t=<unix>,v1=<hex hmac>`; headers `Blixis-Delivery-Id`, `Blixis-Event-Type`, `User-Agent: Blixis-Webhooks/<version>`.
- Timeout via `AbortSignal.timeout` (default 10s); redirects not followed (or limited, same-origin only — decide).
- Success = 2xx; record status and truncated response body (max 1 KB, no headers with secrets).
- Retry schedule: exponential with jitter up to max attempts/age (document); use queue `retry({ delaySeconds })` within limits, or `next_attempt_at` + cron sweep for longer delays (decide based on Queues max delay).
- After N consecutive failures across deliveries: disable webhook, emit event, record reason.
- Queue topology note: measure; if webhook latency affects other consumers, add dedicated queue (record decision).

## Architectural constraints

- No retries for 4xx except 408/429 (document policy).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/webhooks/src/events/deliver.ts
modules/webhooks/src/infrastructure/signer.ts
modules/webhooks/test/deliver.test.ts
modules/webhooks/test/signer.test.ts
```

### Modify

```text
modules/webhooks/src/module.ts
modules/webhooks/src/events.ts
apps/api/wrangler.jsonc (cron sweep, if chosen)
docs/api/webhooks.md
```

### Delete

```text
None.
```

## Implementation steps

1. Signer with tests (known vectors).
2. Delivery handler with timeout and outcome recording.
3. Retry policy and auto-disable.
4. Tests with fake fetch.

## Dependencies

Requires:

- [015.002 — Fan out domain events to webhook delivery requests](./002-event-fanout.md)

## Acceptance criteria

- [ ] Signature verifiable with the documented receiver example.
- [ ] 500 response → retried with increasing delay; 410 → abandoned.
- [ ] Endpoint disabled after threshold.

## Validation

```bash
pnpm --filter @blixis/webhooks test
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
- [ ] Receiver verification example in docs tested against signer output.

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

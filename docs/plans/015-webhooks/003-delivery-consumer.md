# 015.003 — Deliver webhooks with signatures, timeouts, and retries

## Status

```text
completed
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
modules/webhooks/src/infrastructure/migrations/0003_create_attempts.ts
modules/webhooks/src/domain/{signature,retry}.ts
modules/webhooks/src/application/deliver.ts
modules/webhooks/test/{delivery,receiver-example}.test.ts
```

### Modify

```text
modules/webhooks/src/{module,config,events,index}.ts
modules/webhooks/src/infrastructure/{schema,delivery.repository}.ts
modules/webhooks/test/fanout.test.ts (no-network fetch stub)
modules/assets/test/{asset.service,assets.api}.test.ts (lint warnings)
docs/api/webhooks.md, docs/contracts/events.md
apps/docs/src/content/docs/content/webhooks-api.mdx
docs/plans/015-webhooks/*, docs/ROADMAP.md
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

- [x] Signature verifiable with the documented receiver example.
- [x] 500 response → retried with increasing delay; 410 → abandoned.
- [x] Endpoint disabled after threshold.

## Validation

```bash
pnpm --filter @blixis/webhooks test
```

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] Receiver verification example in docs tested against signer output.

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

- **Scheduling decision:** the first attempt runs in the consumer of `webhook.delivery.requested` (events queue); **retries come from a sweep** of `next_attempt_at` on the existing `* * * * *` trigger (25 due deliveries per run, 5 at a time; idle runs cost one indexed query and never touch the secret keys). Queue retries were not used: their delays are capped and apply to whole event batches, while the schedule here reaches 12 hours and lives in Postgres.
- **Claiming:** `update … set attempts = attempts + 1, next_attempt_at = now() + 5 min where status = 'pending' and next_attempt_at <= now() returning` — the queue consumer and the sweep can't send one delivery twice at once, and a crashed attempt is retried after the lease. Due times use the database clock (`now()`), not the Worker's.
- **Queue topology (decision recorded):** deliveries reuse the events queue. One attempt holds a consumer for at most 10 s; with `max_batch_size` 10 a batch of slow receivers could delay other events by up to ~100 s. Accepted for the MVP; a dedicated `blixis-webhooks-<env>` queue is the change if measurements show it.
- **HTTP:** `redirect: 'manual'` (redirects are not followed and count as retryable failures); `AbortSignal.timeout(10 s)`; headers `Content-Type`, `User-Agent: Blixis-Webhooks/1.0`, `Blixis-Delivery-Id` (stable across retries), `Blixis-Event-Id`, `Blixis-Event-Type`, `Blixis-Signature: t=…,v1=…` (HMAC-SHA256 of `t.body` with the full `whsec_` secret). The URL policy is re-checked before every attempt.
- **Retry policy:** 2xx succeeded; 408/429/5xx/3xx/timeout/network → retry after 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h (±20% jitter; 8 attempts, ~22 h) then `failed`; other 4xx → `abandoned` at once (410 included). A missing or broken secret key is our problem: retried, not counted against the webhook.
- **Disabling:** `failure_count` counts consecutive failed attempts that reached (or tried to reach) the endpoint; success resets it. At 50 the webhook is disabled with a reason and `webhook.disabled` is emitted; pending deliveries of an inactive webhook are abandoned without contacting it.
- **Attempt log** (`webhooks.attempts`): number, start, duration, status, error, at most 1 KB of the response body (read incrementally, the rest cancelled) — never headers or the secret.
- **Receiver example is tested:** `receiver-example.test.ts` extracts the TypeScript example from `docs/api/webhooks.md`, evaluates it, and verifies real signatures (tampered, stale, and wrong-secret requests fail). `verifyWebhookSignature` is exported with the same logic.
- **Test lesson:** with `captureEvents()` in `immediate` mode, transactional events are handled inside the emitting transaction; consumers on other connections can't see its rows yet. Delivery tests use `deferred` mode and `flush()` (as after commit, like the outbox). Every webhook test stubs `WEBHOOK_FETCH`: no network in CI.

# 006.003 — Implement the Cloudflare Queue producer adapter

## Status

```text
completed
```

## Parent plan

[006 — Events & Async Processing](./_index.md)

## Objective

Implement `CloudflareQueueEventBus` (producer side) in `@blixis/cloudflare` that serialises envelopes and sends them to the `EVENTS` queue binding, and provision the queue and dead-letter queue for each environment.

## Background

§15 and §19: Queue access through bindings behind the event abstraction. §4 lists Queue producer adapters in `@blixis/cloudflare`. Best-effort events use this directly; transactional events reach it through the outbox dispatcher (006.005).

## Requirements

- Implement a `QueueSender` port in `@blixis/events` (`send(envelopes[])`) and the Cloudflare implementation using `queue.sendBatch` with chunking within batch limits and content type `json`.
- Enforce message size limit with a clear `InfrastructureError` naming event type (payload should carry IDs, not documents).
- `CompositeEventBus` routing: best-effort → queue sender directly; transactional → outbox writer (006.005); plus optional in-process fan-out for synchronous handlers if needed (decide; default none).
- Provision `blixis-events-<env>` queues and `blixis-events-dlq-<env>` via wrangler; add producer bindings `EVENTS` and consumer config (max batch size, max retries, DLQ) to `wrangler.jsonc`.
- Update `ApiEnv`, configuration and Cloudflare operations docs.

## Architectural constraints

- Domain code never calls `env.EVENTS` (§15).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/events/src/queue.ts
packages/cloudflare/src/queues.ts
packages/cloudflare/src/queues.test.ts
```

### Modify

```text
packages/events/src/index.ts
packages/cloudflare/src/index.ts
packages/cloudflare/package.json
packages/cloudflare/tsconfig.json
apps/api/wrangler.jsonc
apps/api/worker-configuration.d.ts
apps/api/src/env.ts
apps/api/src/blixis.config.ts
apps/api/package.json
apps/api/tsconfig.json
docs/operations/configuration.md
docs/operations/cloudflare.md
docs/setup-checklist.md
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Define the sender port.
2. Implement the Cloudflare sender with batching and size checks.
3. Implement the composite bus.
4. Configure queues and bindings.
5. Unit tests with a fake `Queue` binding.

## Dependencies

Requires:

- [006.002 — Implement the in-process event bus](./002-in-process-event-bus.md)

## Acceptance criteria

- [x] Envelopes sent via fake binding are valid JSON matching §15.
- [x] Oversized payloads fail with a clear error.
- [x] Queues and DLQ exist (or are defined) for staging/production in `wrangler.jsonc`.

## Validation

```bash
pnpm --filter @blixis/cloudflare --filter @blixis/events test
pnpm --filter @blixis/api exec wrangler deploy --dry-run --env staging
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
- [x] Current Queues limits cited from docs in Technical notes.

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

- **Code (PR #52):**
  - `QueueSender` port with the `QUEUE_SENDER` token in `@blixis/events`.
  - `queueTransport({ transactional? })` routes best-effort events directly to the queue and transactional events to the outbox transport. Without an outbox, transactional emits fail. **No in-process fan-out** (decided), so every subscriber gets retries and the DLQ.
  - `cloudflareQueueSender` uses `sendBatch` with `contentType: 'json'`, chunked at 100 messages / 256 KiB. Messages over 128 KiB throw `InfrastructureError` naming the event type and id **before** anything is sent. Send failures are retryable `InfrastructureError`s.
  - `eventsQueueModule({ binding = 'EVENTS' })` provides `QUEUE_SENDER` per request from the Worker binding.
- **Queue names:** follow `docs/operations/cloudflare.md` (`blixis-events-<env>` / `blixis-events-<env>-dlq`), not the `blixis-events-dlq-<env>` form in the task text.
- **Deviation:** only **producer** bindings are configured now. The consumer config (`max_batch_size`, `max_retries`, `dead_letter_queue`) arrives with the queue handler in 006.004; a consumer deployed before its handler would dead-letter every message.
- **Provisioned 2026-09-24 by the owner (Workers Paid confirmed):** `blixis-events-staging` (`85fab784…`), `-staging-dlq` (`13b29a37…`), `blixis-events-production` (`f37de9bb…`), `-production-dlq` (`51dbc206…`). Full IDs are in the Cloudflare inventory.
- **Bundle:** 333 KiB gzip.

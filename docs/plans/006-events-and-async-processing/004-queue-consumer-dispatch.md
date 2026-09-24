# 006.004 — Implement queue consumer dispatch to module subscriptions

## Status

```text
completed
```

## Parent plan

[006 — Events & Async Processing](./_index.md)

## Objective

Register a queue handler for the `EVENTS` queue that parses each message into a validated envelope and dispatches it to matching module subscriptions via the shared dispatcher, acknowledging or retrying per message with backoff.

## Background

§15 shows the queue fanning out to webhooks, search, cache invalidation, etc. The Worker adapter (004.003) routes queue batches by queue name to kernel-registered handlers; `@blixis/events` registers the consumer.

## Requirements

- `eventsModule()` registers a queue handler for the configured queue name.
- For each message: parse envelope (invalid → log + `ack` to avoid poison retry loops, with metric/log `event.invalid`; or send to DLQ by exhausting retries — decide and document), dispatch to subscriptions matching `type` (and version compatibility rule: subscription declares supported versions), `ack` on success, `retry({ delaySeconds })` with exponential backoff on failure.
- Per-subscription failure handling: if one subscription fails, the message is retried; idempotency (006.006) prevents re-running succeeded subscriptions.
- Logging fields per §35: `eventType`, `eventId`, `correlationId`, `module`, `duration`, `status`.
- Tests with fake `MessageBatch` objects; Workers-pool test for the full handler path.

## Architectural constraints

- Queue messages are untrusted input (§29): validate before dispatch.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/api/test/events.worker.test.ts
packages/events/src/consumer.test.ts
packages/events/src/consumer.ts
```

### Modify

```text
apps/api/src/blixis.config.ts
apps/api/test/entry.worker.test.ts
apps/api/wrangler.jsonc
apps/docs/src/content/docs/concepts/events.mdx
docs/ROADMAP.md
docs/operations/cloudflare.md
docs/plans/006-events-and-async-processing/004-queue-consumer-dispatch.md
docs/plans/006-events-and-async-processing/_index.md
packages/events/src/index.ts
packages/events/src/module.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Implement consumer with parse/dispatch/ack/retry.
2. Implement backoff policy.
3. Tests (unit + Workers pool).
4. Document version compatibility rules for subscriptions.

## Dependencies

Requires:

- [006.003 — Implement the Cloudflare Queue producer adapter](./003-cloudflare-queue-producer-adapter.md)

## Acceptance criteria

- [x] Valid messages reach subscriptions and are acked.
- [x] A failing subscription causes `retry` with increasing delay.
- [x] Invalid messages never reach handlers.

## Validation

```bash
pnpm --filter @blixis/events test
pnpm --filter @blixis/api test
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
- [x] Poison-message decision documented.

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

- **`eventsModule({ queues })`** registers `consumeEventBatch` for each listed queue via `BACKGROUND_HANDLERS`. The API lists `blixis-events-local|staging|production`; a Worker only receives batches of queues it consumes.
- **Per message (processed concurrently within a batch):**
  - **unrouted** (no subscription for the type): ack plus a `debug` `event.unrouted` log. Retrying would only fill the DLQ, and events without subscribers are normal (e.g. only webhooks care).
  - **delivered**: every matching subscription succeeded → ack.
  - **retrying**: any subscription failed → `retry({ delaySeconds })`.
  - **invalid** (malformed envelope, unknown version, invalid payload for a subscribed type): `retry`, so it reaches the DLQ after `max_retries` for inspection; logged at `error` as `event.invalid` with the validation issues.
- **Decision (documented):** invalid messages are retried into the DLQ rather than acked, because the DLQ is the evidence store. Acking would lose them silently.
- **Backoff:** 5 s × 2^(attempts−1), capped at 600 s (Cloudflare's max retry delay is 12 h; 10 min keeps redelivery timely).
- **Logging (§35):** `event.consumed` has messageId, eventId, eventType, correlationId, attempt, status, subscriptions, failed (`<module>#<id>`), and durationMs. Per-handler failures are also logged by `dispatchEnvelope` with the module.
- **Retry scope:** retries are per message, not per subscription, so one failing subscriber re-delivers the envelope to all. 006.006 idempotency records skip subscriptions that already succeeded.
- **`wrangler.jsonc` consumers:** `max_batch_size` 10, `max_batch_timeout` 5, `max_retries` 5; `dead_letter_queue` = `blixis-events-<env>-dlq` on staging/production (none locally).
- **Test fix:** the 004.005 entry test for "queue without a consumer" used `blixis-events-local`, which now has a consumer. It now uses an unconsumed queue name.
- **Tests:**
  - Node: 5 consumer tests (ack, retry naming the failed subscription, invalid/unknown-version/bad-payload → retry and `event.invalid`, unrouted → ack, backoff curve).
  - Workers pool on the real entry: unrouted → ack; invalid body → retry.
  - Total 292 with `pnpm test:db`; bundle 335 KiB gzip.
- **Deploy note:** the next staging deploy activates the consumer on `blixis-events-staging` (the queues exist since 006.003).

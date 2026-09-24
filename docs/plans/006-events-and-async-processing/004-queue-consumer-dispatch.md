# 006.004 — Implement queue consumer dispatch to module subscriptions

## Status

```text
not-started
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
packages/events/src/queue-consumer.ts
packages/events/src/queue-consumer.test.ts
apps/api/test/events-consumer.worker.test.ts
```

### Modify

```text
packages/events/src/module.ts
packages/events/src/index.ts
docs/contracts/events.md
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

- [ ] Valid messages reach subscriptions and are acked.
- [ ] A failing subscription causes `retry` with increasing delay.
- [ ] Invalid messages never reach handlers.

## Validation

```bash
pnpm --filter @blixis/events test
pnpm --filter @blixis/api test
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
- [ ] Poison-message decision documented.

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

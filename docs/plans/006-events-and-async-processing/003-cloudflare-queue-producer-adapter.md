# 006.003 — Implement the Cloudflare Queue producer adapter

## Status

```text
not-started
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
packages/cloudflare/src/queue-sender.ts
packages/cloudflare/src/queue-sender.test.ts
packages/events/src/ports.ts
packages/events/src/composite-bus.ts
```

### Modify

```text
packages/events/src/index.ts
packages/events/src/module.ts
packages/cloudflare/src/index.ts
packages/cloudflare/package.json
apps/api/wrangler.jsonc
apps/api/src/env.ts
apps/api/src/blixis.config.ts
docs/operations/configuration.md
docs/operations/cloudflare.md
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

- [ ] Envelopes sent via fake binding are valid JSON matching §15.
- [ ] Oversized payloads fail with a clear error.
- [ ] Queues and DLQ exist (or are defined) for staging/production in `wrangler.jsonc`.

## Validation

```bash
pnpm test --filter @blixis/cloudflare --filter @blixis/events
pnpm --filter @blixis/api exec wrangler deploy --dry-run --env staging
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
- [ ] Current Queues limits cited from docs in Technical notes.

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

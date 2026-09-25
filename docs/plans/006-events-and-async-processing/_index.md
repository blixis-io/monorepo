# 006 — Events & Async Processing

## Status

```text
completed
```

Milestone: Milestone 3 — Persistence & event infrastructure  
Roadmap scope: MVP / initial platform  
Progress: 7/7 tasks completed

## Objective

Give modules one way to publish events — `ctx.events.emit(definition, payload, { transaction })` — with an explicit per-event-class consistency guarantee: transactional events are written to a Postgres outbox inside the domain transaction and dispatched to Cloudflare Queues; best-effort events are sent directly. Queue consumers dispatch envelopes to module subscriptions idempotently. Tests use an in-process bus.

## Why this plan exists

§15 requires domain code to use `@blixis/events`, not `env.QUEUE.send()`. §32 forbids assuming DB write + queue send is atomic and recommends an outbox for important events. §33 requires idempotent consumers and idempotency keys for commands. The architecture's suggested order (§42) puts events after content; this roadmap moves the event infrastructure *before* identity and content so that the first domain events (`user.created`, `space.created`, `entry.published`) are emitted correctly from day one instead of being retrofitted.

## Scope

In scope:

- `@blixis/events` package: registry of event definitions, payload validation, envelope creation, `EventBus` implementations (in-process, queue, composite)
- Cloudflare Queue producer adapter and consumer dispatch in `@blixis/cloudflare`
- transactional outbox table, writer, and dispatcher (post-commit + cron sweep)
- processed-events store and idempotent handler wrapper
- command idempotency key store
- queue/DLQ provisioning per environment
- end-to-end delivery tests

Out of scope:

- specific domain event definitions (owned by modules)
- webhook delivery (plan 015), cache invalidation consumers (plan 013)
- Workflows (plan 016)

## Dependencies

Depends on:

- [005 — Database Foundation](../005-database-foundation/_index.md)

## Architecture decisions

- **Abstraction first**: modules depend on `EventBus` from contracts via `ctx.events`/`EVENT_BUS` token; only adapters touch Queues (§15, §48 Architecture.6–7).
- **Delivery classes** (§32): `transactional` events go through the outbox; `best-effort` events send directly after the operation; the class is declared on each `defineEvent` and documented per event in `docs/contracts/events.md`.
- **At-least-once** delivery is assumed everywhere; consumers are idempotent by `(subscription id, event id)` (§33).
- **Serialisable envelopes** with version numbers (§15); payloads validated on emit and on consume (§29 Queue messages are untrusted input).
- **Single events queue initially** (`EVENTS` binding, §19) with a dead-letter queue; split queues only when throughput or isolation requires it.
- **Correlation IDs** propagate from request context into envelope metadata and back into consumer scopes (§35).

## Deliverables

- `packages/events` with registry, buses, outbox, idempotency.
- Queue adapter + consumer dispatch in `@blixis/cloudflare`; `EVENTS` queue and DLQ configured in `wrangler.jsonc` for all environments.
- Outbox dispatcher running post-commit (`waitUntil`) and via cron sweep.
- ADR 0008 (outbox dispatch strategy) accepted.
- End-to-end test: transactional emit → outbox → queue → consumer → processed once under redelivery.

## Tasks

- [x] [001 — Scaffold @blixis/events with the event definition registry](./001-scaffold-events-package-and-registry.md)
- [x] [002 — Implement the in-process event bus](./002-in-process-event-bus.md)
- [x] [003 — Implement the Cloudflare Queue producer adapter](./003-cloudflare-queue-producer-adapter.md)
- [x] [004 — Implement queue consumer dispatch to module subscriptions](./004-queue-consumer-dispatch.md)
- [x] [005 — Implement the transactional outbox and dispatcher](./005-transactional-outbox.md)
- [x] [006 — Implement idempotent consumers and command idempotency keys](./006-idempotent-consumers-and-command-keys.md)
- [x] [007 — Verify the event pipeline end to end](./007-event-pipeline-end-to-end.md)

## Completion criteria

The plan may be marked `completed` when:

- [x] All tasks `completed`.
- [x] A rolled-back transaction never produces a delivered event (test).
- [x] A redelivered message is acknowledged without re-running handler side effects (test).
- [x] Architectural checkpoint CP3 (event consistency) recorded.

## Risks

- **Queues limits** (message size ~128 KB, batch sizes, retry/delay limits, plan requirements) — verify current limits; keep payloads small (IDs, not documents).
- **Outbox latency** if post-commit dispatch fails and only the cron sweep delivers; tune sweep interval.
- **Hot outbox table**: index on undispatched rows, prune dispatched rows periodically.
- **Queues availability on plan**: requires Workers Paid; if unavailable, the in-process bus keeps development moving but staging verification blocks.

## Open questions

- Should cron sweep interval be 1 minute (Cron Triggers minimum granularity) or should dispatch also be retried inline on next request? (ADR 0008.)
- Is a separate queue per consumer group (webhooks, cache, search) needed in MVP for isolation of failures? Default: no; revisit in plan 015/013 with measurements.

## Technical notes

No technical notes yet.

# 015 — Webhooks

## Status

```text
not-started
```

Milestone: Milestone 7 — Assets, integrations & durable processes  
Roadmap scope: MVP / initial platform  
Progress: 0/5 tasks completed

## Objective

Let space admins register HTTPS endpoints that receive signed, versioned notifications for selected events (e.g. `entry.published`), delivered asynchronously with retries and full delivery history, without ever blocking or failing the originating command.

## Why this plan exists

§41 lists `@blixis/webhooks` as an initial module; §15 shows webhook delivery as a primary queue consumer and names `webhook.delivery.requested/completed/failed`; §9 REST covers webhook management; §29 webhook payloads are untrusted boundaries; §33 retries must be idempotent. Webhooks are also the main integration surface for static-site rebuilds (plan 017 example site).

## Scope

In scope:

- webhook configuration schema, service, REST routes, permissions
- subscription to domain events and fan-out into delivery requests
- delivery consumer: HTTP POST, signature, timeout, retry/backoff, DLQ behaviour
- SSRF protection and endpoint validation
- delivery logs and manual redelivery
- tests including a local receiver

Out of scope:

- custom payload templates/transformations (deferred)
- non-HTTP targets (Slack, email) — deferred
- inbound webhooks

## Dependencies

Depends on:

- [011 — Entries, Versions & Publishing](../011-entries-and-publishing/_index.md)

## Architecture decisions

- **Events-driven** (§15): webhooks subscribe to domain events via `@blixis/events`; no domain module calls webhooks directly.
- **Stable public payload**: webhook bodies are versioned public integration contracts (§15 "versioned when payload becomes a public integration contract"); body = `{ id, type, version, timestamp, spaceId, environmentId, data }` with IDs and optionally a minimal entity snapshot (decided in 015.002).
- **Signatures**: HMAC-SHA256 over `timestamp.body` with per-webhook secret; header `Blixis-Signature: t=…,v1=…` (Stripe-like) to prevent replay.
- **Delivery**: at-least-once; receivers dedupe by delivery ID (`Blixis-Delivery-Id`).
- **Isolation**: webhook delivery failures never affect content operations; per-endpoint circuit breaking after repeated failures (disable + notify event).
- **Queue topology**: MVP reuses the events queue with a `webhook.delivery.requested` internal event; a dedicated queue is introduced only if measurements show head-of-line blocking (ADR note in 015.003).

## Deliverables

- `modules/webhooks` registered.
- REST: `GET/POST /api/v1/spaces/:spaceId/webhooks`, `GET/PATCH/DELETE /api/v1/webhooks/:id`, `GET /api/v1/webhooks/:id/deliveries`, `POST /api/v1/webhooks/:id/deliveries/:deliveryId/redeliver`, `POST /api/v1/webhooks/:id/test`.
- Signed deliveries with retries and logs.
- `docs/api/webhooks.md` for receivers (payloads, signature verification example).

## Tasks

- [ ] [001 — Create the webhooks module and configuration API](./001-webhook-configuration.md)
- [ ] [002 — Fan out domain events to webhook delivery requests](./002-event-fanout.md)
- [ ] [003 — Deliver webhooks with signatures, timeouts, and retries](./003-delivery-consumer.md)
- [ ] [004 — Expose delivery logs, redelivery, and test pings](./004-delivery-logs-and-redelivery.md)
- [ ] [005 — Verify webhooks end to end](./005-webhooks-end-to-end.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] Publishing an entry triggers a signed webhook to a local receiver in tests; failures retry with backoff and are logged.
- [ ] SSRF tests prove private/loopback/metadata addresses are rejected in deployed environments.

## Risks

- **SSRF**: user-controlled URLs fetched from Workers; Workers cannot reach private networks by default, but block obvious internal targets and non-HTTPS anyway.
- **Slow receivers** consuming CPU/wall time; enforce timeouts (e.g. 10s) with `AbortSignal.timeout`.
- **Payload size** limits and PII in payloads — minimal payloads by default.

## Open questions

- Include entity snapshots (e.g. published entry fields) in payloads, or IDs only? Default: IDs + minimal metadata; consumers fetch via delivery API.
- Retry schedule and max age (e.g. exponential over 24h)? Default documented in 015.003; tune later.

## Technical notes

No technical notes yet.

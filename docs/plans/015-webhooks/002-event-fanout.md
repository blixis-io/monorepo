# 015.002 — Fan out domain events to webhook delivery requests

## Status

```text
completed
```

## Parent plan

[015 — Webhooks](./_index.md)

## Objective

Subscribe to public domain events and, for each matching active webhook, create a delivery record and emit `webhook.delivery.requested`.

## Background

§15 event names include `webhook.delivery.requested`; §33 idempotent consumers.

## Requirements

- Subscriptions for all public event types in the allow-list; handler loads matching webhooks for the event's space/environment.
- Migration: `webhook_deliveries(id, webhook_id, event_id, event_type, payload jsonb, status (pending|succeeded|failed|abandoned), attempts, next_attempt_at, last_status_code, last_error, created_at, updated_at, unique(webhook_id, event_id))` — unique constraint gives idempotency.
- Payload builder producing the public webhook body (versioned).
- Emit `webhook.delivery.requested` (transactional, same transaction as delivery row).
- Document public webhook payload schema in `docs/api/webhooks.md`.

## Architectural constraints

- Fan-out handler is idempotent (unique constraint + processed-events).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/webhooks/src/infrastructure/migrations/0002_create_deliveries.ts
modules/webhooks/src/infrastructure/delivery.repository.ts
modules/webhooks/src/domain/payload.ts
modules/webhooks/src/application/{fanout,public-events}.ts
modules/webhooks/src/events.ts
modules/webhooks/test/fanout.test.ts
docs/api/webhooks.md
```

### Modify

```text
modules/webhooks/src/{module,index}.ts, src/infrastructure/schema.ts
modules/webhooks/package.json, tsconfig.json (content and assets event definitions)
docs/contracts/events.md
apps/docs/src/content/docs/content/webhooks-api.mdx
docs/plans/015-webhooks/*, docs/ROADMAP.md, pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Delivery table.
2. Fan-out handler and payload builder.
3. Tests incl. redelivery of source event.
4. Payload docs.

## Dependencies

Requires:

- [015.001 — Create the webhooks module and configuration API](./001-webhook-configuration.md)

## Acceptance criteria

- [x] One `entry.published` with two matching webhooks creates exactly two delivery rows even if redelivered.

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
- [x] Payload schema documented as public contract with version.

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

- **Idempotency without processed-event markers:** the unique `(webhook_id, event_id)` plus `insert … on conflict do nothing returning` creates rows only once; `webhook.delivery.requested` is emitted in the same transaction for the rows actually created. A redelivered event creates and requests nothing (tested by calling the subscription twice). Transactional idempotency (`processed` markers) wasn't needed and would require the outbox module in every test.
- **Payload decision (open question):** ids only, plus `id` (event id, for receiver deduplication), `type`, `version` (event schema version), `createdAt`, `spaceId`, `environmentId`. `data` is an explicit allow-list per group (entry, content-type, asset), so internal fields such as asset storage keys or organization ids never leak when event payloads grow (tested). Contract in `docs/api/webhooks.md`.
- **Event definitions:** `@blixis/webhooks` imports the public event definitions from `@blixis/content` and `@blixis/assets` (peer dependencies) — subscribing needs them; the emitting modules stay optional at runtime (`meta.requires` lists only spaces and permissions). A test keeps `PUBLIC_EVENT_DEFINITIONS` equal to the documented `PUBLIC_WEBHOOK_EVENTS`.
- **Matching:** active webhooks of the space; `environmentId` null or equal to the event's; any `eventTypes` pattern matching (`exact`, `group.*`, `*`). Inactive webhooks get nothing.
- **Deliveries** are created `pending` with `next_attempt_at = now()`; attempts, status codes and errors are filled by 015.003. Deleting a webhook (or its space) cascades to its deliveries.

# 015.002 — Fan out domain events to webhook delivery requests

## Status

```text
not-started
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
modules/webhooks/src/events/fanout.ts
modules/webhooks/src/domain/payload.ts
modules/webhooks/src/infrastructure/delivery.repository.ts
modules/webhooks/src/infrastructure/migrations/0002_create_webhook_deliveries.sql
modules/webhooks/src/events.ts
modules/webhooks/test/fanout.test.ts
docs/api/webhooks.md
```

### Modify

```text
modules/webhooks/src/module.ts
docs/contracts/events.md
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

- [ ] One `entry.published` with two matching webhooks creates exactly two delivery rows even if redelivered.

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
- [ ] Payload schema documented as public contract with version.

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

# 015.004 — Expose delivery logs, redelivery, and test pings

## Status

```text
completed
```

## Parent plan

[015 — Webhooks](./_index.md)

## Objective

Provide REST endpoints to list deliveries with status, manually redeliver a delivery, and send a test ping.

## Background

Operational visibility is essential for integrators; manual redelivery reuses the same pipeline.

## Requirements

- `GET /api/v1/webhooks/:id/deliveries?status=&cursor=`.
- `POST /api/v1/webhooks/:id/deliveries/:deliveryId/redeliver` (new attempt, same delivery ID, idempotency key supported).
- `POST /api/v1/webhooks/:id/test` sends a `webhook.ping` event.
- Retention of delivery logs (e.g. 30 days) via cron.

## Architectural constraints

- Logs never include secrets or full receiver responses.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/webhooks/test/logs.test.ts
```

### Modify

```text
modules/webhooks/src/application/webhook.service.ts (listDeliveries, getDelivery, redeliver, ping)
modules/webhooks/src/infrastructure/delivery.repository.ts
modules/webhooks/src/rest/webhook.routes.ts
modules/webhooks/src/{module,index}.ts, src/domain/retry.ts
tooling/tenant-isolation/test/{routes,authz-routes,isolation.test,authz-matrix.test}.ts
tooling/postman/blixis.postman_collection.json
apps/docs/src/content/docs/content/webhooks-api.mdx, docs/api/webhooks.md
docs/plans/015-webhooks/*, docs/ROADMAP.md
```

### Delete

```text
None.
```

## Implementation steps

1. Routes and service methods.
2. Retention job.
3. Tests.

## Dependencies

Requires:

- [015.003 — Deliver webhooks with signatures, timeouts, and retries](./003-delivery-consumer.md)

## Acceptance criteria

- [x] Redelivery produces a new attempt recorded in the log.
- [x] Test ping reaches receiver.

## Validation

```bash
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
- [x] Retention period documented.

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

- **Routes:** `GET /webhooks/:id/deliveries` (status filter, `limit`, `cursor`; newest first by UUIDv7 id), `GET /webhooks/:id/deliveries/:deliveryId` (adds `attemptLog`), `POST …/redeliver` (`202`, `Idempotency-Key`), `POST /webhooks/:id/test` (`202`). Deliveries are always looked up together with their webhook and space, so another webhook's delivery id answers `404` (tested).
- **Redelivery** sets the delivery `pending` and due now, and emits `webhook.delivery.requested` in the same transaction; the attempt keeps the delivery id and event id. After a delivery ran out of attempts, a redelivery is exactly one more attempt (`nextAttemptAt(9)` is undefined).
- **Test pings** create a real delivery with a fresh event id and type `webhook.ping` (`data: { webhookId }`), signed and logged like any other. Inactive webhooks answer `409` (the consumer would abandon it anyway).
- **Retention:** the per-minute sweep deletes finished deliveries (and, by cascade, their attempts) older than `DELIVERY_LOG_DAYS` (30) once an hour, at minute 7 of the trigger's `scheduledTime`; pending deliveries stay whatever their age.
- **Coverage:** 4 new routes in the isolation suite (fingerprint includes deliveries) and the authorization matrix (seeds get a ping delivery; the test transport never sends it); Postman: *Send test ping*, *List deliveries*, *Get delivery*, *Redeliver*.

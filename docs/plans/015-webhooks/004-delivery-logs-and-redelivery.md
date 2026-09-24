# 015.004 — Expose delivery logs, redelivery, and test pings

## Status

```text
not-started
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
modules/webhooks/test/deliveries-api.test.ts
```

### Modify

```text
modules/webhooks/src/rest/routes.ts
modules/webhooks/src/application/webhook.service.ts
modules/webhooks/src/module.ts
apps/api/test/tenant-routes.allowlist.ts
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

- [ ] Redelivery produces a new attempt recorded in the log.
- [ ] Test ping reaches receiver.

## Validation

```bash
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
- [ ] Retention period documented.

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

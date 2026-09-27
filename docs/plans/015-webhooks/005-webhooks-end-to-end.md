# 015.005 — Verify webhooks end to end

## Status

```text
completed
```

## Parent plan

[015 — Webhooks](./_index.md)

## Objective

Run a Workers-pool end-to-end test from entry publish to a signed webhook received by a local receiver (auxiliary worker or fetch mock), including failure/retry and SSRF rejection, and verify on staging with a request-bin style endpoint.

## Background

Validates events → fan-out → delivery → logs across modules.

## Requirements

- Scenario test: create webhook → publish entry → receiver gets signed payload → signature verified → delivery succeeded.
- Failure scenario: receiver 500 twice then 200 → three attempts logged.
- SSRF scenario in production mode config.
- Staging manual verification steps in `docs/api/webhooks.md` (or operations doc).

## Architectural constraints

- No external network in CI tests.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/webhooks/test/webhooks.e2e.test.ts
docs/operations/webhooks.md
```

### Modify

```text
docs/plans/015-webhooks/*, docs/ROADMAP.md
```

### Delete

```text
None.
```

## Implementation steps

1. Receiver fixture.
2. Scenarios.
3. Staging verification.

## Dependencies

Requires:

- [015.004 — Expose delivery logs, redelivery, and test pings](./004-delivery-logs-and-redelivery.md)

## Acceptance criteria

- [x] All scenarios pass in CI.

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
- [x] Evidence recorded in plan Technical notes.

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

- **Scenarios** (`webhooks.e2e.test.ts`, REST only, local receiver via `WEBHOOK_FETCH`, no network): (1) create webhook → create + publish entry → one signed delivery whose signature verifies, body `entry.published` with the entry id, log `succeeded` with the same `Blixis-Delivery-Id`; (2) receiver answers 500, 500, then 204 → three attempts logged; (3) SSRF in deployed mode: five internal targets refused on save, and a URL saved while local targets were allowed is abandoned at send time (`URL refused: Use an https:// URL`) without contacting it.
- **Events are delivered as after commit** (`captureEvents` deferred + `flush()`), matching the outbox in production.
- **Staging verification** steps are in `docs/operations/webhooks.md`; they need `WEBHOOK_SECRET_KEYS`, migrations `0001`–`0003`, and an HTTPS receiver the owner controls.

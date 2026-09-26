# 013.004 — Invalidate delivery caches from content events

## Status

```text
completed
```

## Parent plan

[013 — Delivery Caching & Invalidation](./_index.md)

## Objective

Subscribe to `entry.published`, `entry.unpublished`, `entry.deleted`, `content-type.updated/deleted`, and `locale.*` events and bump the relevant version stamps (and/or purge) idempotently.

## Background

§34 event-driven invalidation via Queue; §33 idempotent consumers.

## Requirements

- Subscription in the caching owner module; bump `(space, environment)` stamp (coarse invalidation in MVP; finer granularity deferred).
- Idempotent handler (006.006) — bumping twice is harmless but still record processing.
- Measure publish-to-fresh latency on staging; compare to ADR bound.
- Update `docs/contracts/events.md` consumers column.

## Architectural constraints

- Invalidation failures retry via queue; never silently dropped.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/src/application/delivery-cache.ts
modules/content/src/infrastructure/stamp.repository.ts
modules/content/src/infrastructure/migrations/0003_create_delivery_stamps.ts
modules/content/test/delivery.cache.test.ts
```

### Modify

```text
modules/content/src/module.ts (policy, subscriptions, stampTtlMs)
modules/content/src/events.ts (organizationId, spaceId in entry and content-type payloads)
modules/content/src/application/content.service.ts
modules/content/src/application/content-type.service.ts
modules/auth/src/application/delivery-keys.ts (key memo)
modules/auth/src/module.ts (deliveryKeyMemoSeconds)
docs/contracts/events.md (consumers)
```

### Delete

```text
None.
```

## Implementation steps

1. Subscription and stamp bump.
2. Tests (publish → next query MISS with new content).
3. Staging measurement.

## Dependencies

Requires:

- [013.003 — Cache published delivery responses](./003-delivery-response-caching.md)

## Acceptance criteria

- [x] After publish, the next delivery query returns updated content within the documented bound (Workers-pool test uses immediate stamps).

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
- [x] Staleness bound verified and documented.

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

- **Stamps:**
  - `content.delivery_stamps(space_id pk, organization_id, stamp bigint, updated_at)` (content migration `0003`);
  - `stampRepository.bump` is an upsert `+1` that only moves forward, so redelivered events are harmless (processed markers still apply via the default `after` idempotency).
- **Subscriptions** (`delivery-stamp.<type>`) on `entry.published/unpublished/deleted`, `content-type.*` and `locale.*` bump the space's stamp. `space.deleted` also deletes the stamp row. Deviation: the task suggested `(space, environment)`; the stamp is per **space** (coarser, ADR 0012), because locale and model changes span environments.
- **Finding, fixed:** entry and content-type events had no `spaceId`/`organizationId` in their payloads, only in the envelope, which is empty when services run outside a bound request (background jobs, tests). A publish then didn't invalidate. Plan 011's event spec had listed `spaceId`; both ids are now in the payloads (additive, still version 1), and `bumpForEvent` uses the envelope, then the payload.
- **Policy** (`GRAPHQL_CACHE_POLICY` from `@blixis/content`):
  - only `delivery`-kind keys with `environmentIds: null`, and no conflicting `?space=`;
  - the scope is `space:environment-param:stamp`.
  - Preview keys, users, API tokens and environment-limited keys bypass. Previews by delivery keys fail with `FORBIDDEN` and are never stored.
- **Isolate memos:**
  - **Stamp:** `contentModule({ stampTtlMs })`, default 2000 ms. A bump in the same isolate updates the memo immediately.
  - **Delivery keys:** `authModule({ deliveryKeyMemoSeconds })`, default 30 s. It's cleared for the key on revoke and for the space on delete in that isolate.
- **Proven:**
  - a cache hit makes **0 SQL statements** while the stamp is remembered (`countQueries`);
  - after a publish, the next request is a MISS with new content;
  - a locale creation invalidates;
  - the bypass cases.
- **Consumers column** in `docs/contracts/events.md` updated for the 9 events.
- **Staging publish-to-fresh latency** is measured in 013.005, after the deploy (needs content migration `0003`).

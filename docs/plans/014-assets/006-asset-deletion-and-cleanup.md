# 014.006 — Implement idempotent asset deletion and orphan cleanup

## Status

```text
completed
```

## Parent plan

[014 — Assets on R2](./_index.md)

## Objective

Delete R2 objects asynchronously via an idempotent `asset.deleted` consumer and clean up orphaned pending uploads and aborted multipart uploads on a schedule.

## Background

§33 idempotent consumers; §32 transactional events for state-changing side effects.

## Requirements

- `asset.deleted` subscription deletes the R2 object(s); idempotent (processed-events or naturally idempotent delete + marker).
- Cron: delete pending assets older than N hours and their objects; abort stale multipart uploads.
- Referential rule: deleting an asset linked from published entries → `ConflictError` unless `force` (consistent with 011.004 unpublish rule).
- Tests including redelivery.

## Architectural constraints

- Binary deletion only after metadata commit.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/assets/test/cleanup.test.ts
docs/operations/assets.md
```

### Modify

```text
packages/contracts/src/assets.ts
modules/content/src/module.ts
modules/assets/src/application/asset.service.ts
modules/assets/src/config.ts
modules/assets/src/infrastructure/asset.repository.ts
modules/assets/src/module.ts
modules/assets/src/rest/asset.routes.ts
modules/assets/test/assets.api.test.ts
modules/assets/test/content-links.test.ts
apps/docs/src/content/docs/content/assets-api.mdx
docs/contracts/events.md
docs/plans/014-assets/006-asset-deletion-and-cleanup.md
docs/plans/014-assets/_index.md
docs/ROADMAP.md
```

### Delete

```text
None.
```

## Implementation steps

1. Consumer.
2. Cron cleanup.
3. Referential rule.
4. Tests.

## Dependencies

Requires:

- [014.005 — Validate asset links from content via capability](./005-content-asset-links.md)

## Acceptance criteria

- [x] Redelivered `asset.deleted` does not error and deletes once.
- [x] Stale pending assets cleaned.

## Validation

```bash
pnpm --filter @blixis/assets test
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
- [x] Cleanup windows documented in `docs/operations/cloudflare.md`.

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

- **File deletion** runs in subscriptions after the metadata commit: `delete-file` (`asset.deleted`), `delete-replaced-file` (`asset.updated` with `replacedObjectKey`), `delete-space-files` (`space.deleted`, pages through the `<spaceId>/` prefix). Deleting a missing key is a no-op, so the default `after` idempotency plus redelivery is safe; the test redelivers an envelope twice and observes one real deletion.
- **Bug fixed:** `assetRepository.deleteAllForSpace` used `tenantScope` without an environment, which throws (fail-closed, ADR 0007); the subscription failure was isolated and logged, so asset rows of deleted spaces stayed. It now matches organization and space explicitly, like content.
- **Referential rule** via a third port, `ASSET_USAGE` (contracts), provided by `@blixis/content` from `entry_references` (published versions). Unpublishing *and* deleting an asset that published entries use answer `409` with `details.publishedReferrers`, unless `force` (`{ force: true }` / `?force=true`), consistent with entry unpublishing (011.004). Deleting already required unpublishing first.
- **Stale uploads:** a background job on `cleanupCron` (default `* * * * *`, the trigger that already exists — no wrangler change) removes pending assets older than `pendingTtlHours` (24): aborts the multipart upload, deletes stored bytes, deletes the row; up to 100 per run, one query via `assets_pending_idx` when idle. The sweep reads across tenants (system job, like the outbox sweep).
- **No full orphan scan of R2:** objects are only written under keys reserved by a pending row, and failed requests clean up inline, so crashes are covered by the pending cleanup. A bucket-wide reconciliation can come later if storage metrics disagree with Postgres.
- **Operations:** `docs/operations/assets.md` (layout, limits, cleanup, troubleshooting, staging verification).

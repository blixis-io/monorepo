# 014.006 — Implement idempotent asset deletion and orphan cleanup

## Status

```text
not-started
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
modules/assets/src/events/handlers.ts
modules/assets/test/cleanup.test.ts
```

### Modify

```text
modules/assets/src/module.ts
modules/assets/src/application/asset.service.ts
apps/api/wrangler.jsonc
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

- [ ] Redelivered `asset.deleted` does not error and deletes once.
- [ ] Stale pending assets cleaned.

## Validation

```bash
pnpm test --filter @blixis/assets
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
- [ ] Cleanup windows documented in `docs/operations/cloudflare.md`.

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

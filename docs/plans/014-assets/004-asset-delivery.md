# 014.004 — Serve published assets

## Status

```text
not-started
```

## Parent plan

[014 — Assets on R2](./_index.md)

## Objective

Serve published asset binaries through a public delivery route with correct headers, range requests, ETags, and edge caching; serve unpublished assets only to preview-authorised actors.

## Background

§17 R2 binaries; §34 public content caching. Asset URLs appear in delivery API responses (012) and SDK (017).

## Requirements

- Route (root-level, outside `/api/v1`, via platform route mechanism from 012.001): `GET /assets/:spaceId/:assetId/:filename`.
- Published check via `ASSET_SERVICE`; unpublished → 404 unless preview key/user.
- Headers: `Content-Type` from metadata, `Content-Disposition` rules, `nosniff`, long `Cache-Control` with immutable object keys (new upload = new key), `ETag`; support `Range`.
- Include asset URLs in GraphQL delivery (`Asset.url`) — extend content delivery schema via assets module contribution.
- Tests for range, headers, unpublished access.

## Architectural constraints

- SVG/HTML served with restrictive CSP or as attachment (ADR 0013).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/assets/src/rest/delivery.ts
modules/assets/src/graphql/schema.ts
modules/assets/src/graphql/resolvers.ts
apps/api/test/asset-delivery.worker.test.ts
```

### Modify

```text
modules/assets/src/module.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Delivery route.
2. Headers and range.
3. GraphQL `Asset` type contribution.
4. Tests.

## Dependencies

Requires:

- [014.003 — Implement upload flows and asset management routes](./003-upload-flows-and-routes.md)

## Acceptance criteria

- [ ] Published asset fetch returns 200 with cache headers; range returns 206.
- [ ] Unpublished asset returns 404 for anonymous.

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
- [ ] No path allows reading another space's objects by key manipulation.

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

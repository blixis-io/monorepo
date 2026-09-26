# 014.004 — Serve published assets

## Status

```text
in-progress
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
modules/assets/src/rest/delivery.routes.ts
modules/assets/test/delivery.api.test.ts
modules/assets/test/fixtures.ts
```

### Modify

```text
packages/contracts/src/module.ts
packages/kernel/src/internal/rest.ts
packages/kernel/src/internal/rest.test.ts
modules/assets/src/application/asset.service.ts
modules/assets/src/config.ts
modules/assets/src/domain/asset.ts
modules/assets/src/index.ts
modules/assets/src/infrastructure/asset.repository.ts
modules/assets/src/module.ts
modules/assets/src/permissions.ts
modules/assets/test/assets.api.test.ts
modules/assets/test/sniff.test.ts
tooling/postman/blixis.postman_collection.json
apps/docs/src/content/docs/content/assets-api.mdx
apps/docs/src/content/docs/concepts/modules.mdx
docs/decisions/0013-asset-uploads.md
docs/plans/014-assets/004-asset-delivery.md
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

- [x] Published asset fetch returns 200 with cache headers; range returns 206.
- [x] Unpublished asset returns 404 for anonymous.

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
- [x] No path allows reading another space's objects by key manipulation.

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

- **URL:** `/assets/:spaceId/:assetId/:fileId/:filename` instead of `/assets/:spaceId/:assetId/:filename`. The `fileId` (last segment of the object key) makes every URL name one immutable file and doubles as the strong `ETag`, so `If-None-Match` needs no storage call. A URL of a replaced file answers `302` to the current one (`max-age=60`). The file name is cosmetic. `AssetView.fields.url` carries the path.
- **Cache lifetime deviates from ADR 0013 §5** (amended): published files get `public, max-age=86400` by default (`deliveryMaxAge`), not a year and `immutable` — unpublishing and deleting must reach caches in bounded time. No Workers Cache API layer: R2 reads are fast, and browser/CDN caching of public responses covers repeats; revisit with a custom domain (plan 021).
- **Access:** published → public, with `Access-Control-Allow-Origin: *` and `Cross-Origin-Resource-Policy: cross-origin`. Unpublished → new permission `assets.preview.read` (admin, editor, viewer; preview keys) with `private, no-store` and `Vary: Authorization`. Pending, missing, another space, or no access → `404` (existence never leaks; anonymous callers too, not `401`).
- **Headers:** `nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`, `Content-Disposition` inline for images/audio/video/PDF and attachment otherwise (RFC 6266 with UTF-8 `filename*`), `Accept-Ranges`. One `Range` → `206` with `Content-Range`; unsatisfiable → `416`; several ranges → whole file (`200`, allowed by RFC 9110). `HEAD` answers without reading the object.
- **Kernel/contracts:** a module's `rest` may now be a list, so the assets module mounts its Management API routes and the root-level delivery route (`root: true`) side by side. Kernel test added; *Modules* concept updated.
- **GraphQL `Asset.url` moves to 014.005:** the `Asset` type belongs to `@blixis/content`'s delivery schema, and content resolves assets through the optional `blixis.assets` capability there — the assets module can't extend a type it doesn't require.
- **Isolation:** the delivery route has no `spaces/:spaceId` or `assets/:assetId` segment pair, so the isolation suite doesn't pick it up; `delivery.api.test.ts` covers other spaces' preview keys, delivery keys, anonymous callers, and a mismatched space in the URL.
- **Tests:** `parseRange` unit tests; delivery API tests (access, headers, `304`, ranges, `416`, `HEAD`, attachment, redirect). The `png` fixture moved to `test/fixtures.ts` (importing a `*.test.ts` file re-ran its tests). Postman: *Download asset (published)* and *Download asset range*.

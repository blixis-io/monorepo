# 014.005 — Validate asset links from content via capability

## Status

```text
completed
```

## Parent plan

[014 — Assets on R2](./_index.md)

## Objective

Complete content's asset link support: validate that linked assets exist in the same space (and are published when the entry is published) through `ASSET_SERVICE` when the `blixis.assets` capability is present, and resolve asset links in delivery.

## Background

§8 capabilities avoid package-name coupling; 010.003 created the asset field type; 011.006 stores asset references.

## Requirements

- `@blixis/content` optionally resolves `ASSET_SERVICE` (`getOptional`) — if assets capability absent, asset fields are rejected at content-type creation with a clear error.
- Draft validation: asset exists in same space (or allow dangling per ADR 0010).
- Publish validation: linked assets must be published.
- Delivery: resolve asset links via batched loader.
- Tests with and without assets module registered.

## Architectural constraints

- No import from `@blixis/assets` internals; use its public token/types (or contracts port).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
packages/contracts/src/assets.ts
modules/assets/test/content-links.test.ts
```

### Modify

```text
packages/contracts/src/index.ts
packages/graphql/src/context.ts
modules/content/src/application/content.service.ts
modules/content/src/application/content-type.service.ts
modules/content/src/domain/links.ts
modules/content/src/graphql/delivery.ts
modules/content/src/module.ts
modules/content/test/content-types.api.test.ts
modules/assets/src/domain/asset.ts
modules/assets/src/infrastructure/asset.repository.ts
modules/assets/src/module.ts
modules/assets/package.json
modules/assets/tsconfig.test.json
apps/docs/src/content/docs/content/field-types.mdx
apps/docs/src/content/docs/content/delivery-api.mdx
apps/docs/src/content/docs/content/assets-api.mdx
apps/docs/src/content/docs/concepts/entries-and-publishing.mdx
apps/docs/src/content/docs/concepts/graphql.mdx
docs/plans/014-assets/005-content-asset-links.md
docs/plans/014-assets/_index.md
docs/ROADMAP.md
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Optional capability resolution.
2. Validation rules.
3. Delivery resolution.
4. Tests (both configurations).

## Dependencies

Requires:

- [014.004 — Serve published assets](./004-asset-delivery.md)

## Acceptance criteria

- [x] Entry cannot be published while linking an unpublished asset.
- [x] Content module boots without assets module (asset field type disabled).

## Validation

```bash
pnpm --filter @blixis/content test
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
- [x] Capability-based coupling verified (no package import of assets internals).

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

- **No package dependency between content and assets.** Two small ports in `@blixis/contracts`:
  - `ASSET_LOOKUP` (`findMany(tenant, ids)` → `AssetSummary`), provided by `@blixis/assets`, resolved by content with `getOptional`;
  - `DELIVERY_INVALIDATION` (`spaceChanged(tenant)`), provided by `@blixis/content` (bumps the space's delivery stamp, ADR 0012), called by `@blixis/assets` from its own subscriptions to `asset.published|unpublished|updated|deleted`.
  Content can't subscribe to asset events itself: that needs the event definitions (a package dependency), and the event registry rejects a second, mirrored definition of the same type.
- **Without the assets module** (no `ASSET_LOOKUP`), asset fields are refused at content-type creation (`fields[i].type`). Rich-text `embeddedAsset` nodes are not refused; their links are only checked when a lookup exists.
- **Drafts** may link any asset id (like entry references, ADR 0010). **Publishing** checks every asset link — fields, blocks, rich-text embeds — in one batched lookup: must exist (`Links to an asset that does not exist`), be published (`… unpublished asset: publish it first`), and match the field's `mimeTypes` (`image/*` patterns; `LinkUsage` now carries them).
- **GraphQL:** `Asset { id url filename mimeType size width height title description }`, loaded through one batch loader per request. `url` is absolute from the request origin (`GraphQLContext.request`, now declared); `title`/`description` follow the requested locale's fallbacks. Unpublished or missing assets drop out of published responses, like unresolved entry links; `preview: true` shows drafts. `RichText.assets` lists embedded assets.
- **Cache scope** gained the request host (`host|space:env:stamp`): responses contain absolute URLs, so `workers.dev` and a custom domain must not share entries.
- **Not blocked:** unpublishing or deleting an asset that published entries link to. Assets can't see content's references without the reverse dependency; the links stop resolving, and the manual says so. A usage check can come with an asset-usage port if needed.
- **REST `?include`** still returns entries only; asset details reach clients through GraphQL (a REST `includes.assets` can follow).
- **Tests** live in `modules/assets/test/content-links.test.ts` (assets may depend on content in tests, not the other way round): publish checks, GraphQL fields, absolute URL, locale fallback, cache `HIT` → `MISS` after unpublishing the asset, preview. Content's own test covers the refusal without assets.

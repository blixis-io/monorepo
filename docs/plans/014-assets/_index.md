# 014 — Assets on R2

## Status

```text
not-started
```

Milestone: Milestone 7 — Assets, integrations & durable processes  
Roadmap scope: MVP / initial platform  
Progress: 0/6 tasks completed

## Objective

Let editors upload, list, update, and delete binary assets per space: binaries live in R2, canonical metadata lives in Postgres (§17), asset events are emitted, content entries can link to assets with existence validation, and published assets are served efficiently.

## Why this plan exists

§17 R2 for binaries and Postgres for canonical asset metadata; §9 lists `POST /api/v1/assets` and `DELETE /api/v1/assets/:id`; §41 initial modules include `@blixis/assets`; §42 Stage 7 R2, metadata, upload flows, asset events. §8 shows `blixis.assets` capability used by third-party modules.

## Scope

In scope:

- ADR 0013 upload strategy
- `ObjectStorage` port and R2 adapter
- `modules/assets`: schema, service (`ASSET_SERVICE`), routes, permissions, events
- upload flows (single upload streaming; multipart for large files if in ADR)
- public/preview asset delivery with caching headers
- content integration: asset link validation via capability
- deletion with idempotent R2 cleanup via events

Out of scope:

- image transformations/resizing (Cloudflare Images or Image Resizing — deferred decision; documented)
- video processing, virus scanning (deferred; Workflows candidates in plan 016 or later)
- asset folders/tags beyond simple metadata (deferred)

## Dependencies

Depends on:

- [012 — GraphQL Platform & Content Delivery API](../012-graphql-delivery-api/_index.md)

## Architecture decisions

- **R2 via binding** (`ASSETS` bucket, §19); no S3 API from the Worker unless ADR 0013 justifies presigned uploads.
- **Postgres canonical metadata** (§17): R2 object metadata is never the source of truth.
- **Object keys** are opaque and tenant-prefixed (`<spaceId>/<assetId>/<variant>`), never derived from user filenames.
- **Events**: `asset.created`, `asset.updated`, `asset.deleted` (§15); deletion of the R2 object happens in an idempotent consumer after the metadata transaction commits (avoids deleting binaries for a rolled-back delete).
- **Content integration via capability** `blixis.assets`: content validates asset links through `ASSET_SERVICE` when available (optional capability), avoiding a hard package dependency.

## Deliverables

- ADR 0013 accepted.
- `modules/assets` registered; R2 buckets per environment.
- REST: `GET/POST /api/v1/spaces/:spaceId/assets`, `GET/PATCH/DELETE /api/v1/assets/:id` (+ the §9 short forms), upload endpoint(s).
- Delivery route for published assets (e.g. `/assets/:spaceId/:assetId/:filename`) with cache headers.
- Isolation and authz coverage.

## Tasks

- [ ] [001 — Decide upload strategy and implement the R2 object storage adapter](./001-upload-strategy-and-object-storage.md)
- [ ] [002 — Create the assets module schema and service](./002-asset-schema-and-service.md)
- [ ] [003 — Implement upload flows and asset management routes](./003-upload-flows-and-routes.md)
- [ ] [004 — Serve published assets](./004-asset-delivery.md)
- [ ] [005 — Validate asset links from content via capability](./005-content-asset-links.md)
- [ ] [006 — Implement idempotent asset deletion and orphan cleanup](./006-asset-deletion-and-cleanup.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] Upload → metadata → event → link from entry → publish → public fetch works end to end.
- [ ] Deleting an asset removes the R2 object exactly once even under redelivery.

## Risks

- **Worker request body limits** (plan-dependent max upload size) constrain direct uploads; ADR 0013 must state the limit and large-file approach.
- **Streaming**: avoid buffering whole files in memory (Workers memory limit 128 MB).
- **Content-type sniffing / XSS** via uploaded HTML/SVG served from the API origin — serve with safe headers or from a separate domain.

## Open questions

- Presigned direct-to-R2 uploads (needs R2 S3 API credentials in the Worker) vs. streaming through the Worker (bindings only)? (ADR 0013; recommendation: stream through Worker for MVP with documented max size; R2 multipart via binding for large files.)
- Image transformations: Cloudflare Images vs. Image Resizing via `cf.image` on a custom domain — deferred; which one is preferred later?
- Serve assets from a separate hostname (e.g. `assets.<domain>`) for security isolation? Default: yes once custom domains exist.

## Technical notes

No technical notes yet.

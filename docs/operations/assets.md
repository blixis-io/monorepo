# Assets

How asset files are stored, served, and cleaned up ([ADR 0013](../decisions/0013-asset-uploads.md), plan 014). The API is documented in the manual: [Assets API](../../apps/docs/src/content/docs/content/assets-api.mdx); module authors use [object storage](../../apps/docs/src/content/docs/concepts/object-storage.mdx).

Related: [Cloudflare Workers](./cloudflare.md) · [Configuration](./configuration.md) · [Delivery caching](./caching.md) · [Events](./events.md)

---

## Where things live

| What | Where |
|---|---|
| Asset records (name, type, size, titles, state) | Postgres `assets.assets` — the source of truth |
| Files | R2 bucket `blixis-assets-<env>` (binding `ASSETS`), key `<spaceId>/<assetId>/<fileId>` |
| Multipart uploads in progress | R2 (parts) + `upload_id`, `upload_size`, `upload_part_size` on the pending row |

Keys are opaque and never reused: a replaced file gets a new `fileId`. R2 object metadata holds only the content type.

## Limits and settings

| Setting | Default | Where |
|---|---|---|
| single-request upload | 90 MiB | `assetsModule({ maxDirectUploadBytes })` — keep below the plan's request limit (100 MB on Free/Pro) |
| asset size | 1 GiB | `maxAssetBytes` (R2 allows 5 TiB) |
| multipart part size | 10 MiB | `multipartPartBytes` (R2 needs ≥ 5 MiB; grown past 10 000 parts) |
| allowed types | images, PDF, audio, video, text, CSV, JSON, ZIP, Office | `allowedTypes`; HTML, XHTML, JavaScript, XML are always refused |
| delivery cache lifetime | 1 day | `deliveryMaxAge` |
| stale pending uploads | 24 hours | `pendingTtlHours` |
| cleanup job | every minute | `cleanupCron` (must be a trigger in `wrangler.jsonc`) |

## Cleanup

| Trigger | What goes | How |
|---|---|---|
| `asset.deleted` | the asset's file | subscription `delete-file`, after the metadata commit; deleting a missing key is a no-op, so redelivery is harmless |
| `asset.updated` with `replacedObjectKey` | the replaced file | subscription `delete-replaced-file` |
| `space.deleted` | every file under `<spaceId>/` and every asset row | subscriptions `delete-space-files`, `delete-space-assets` |
| cleanup cron | pending assets older than 24 h, their multipart uploads and stored bytes | one indexed query per run (`assets_pending_idx`); up to 100 per run |
| R2 itself | incomplete multipart uploads after 7 days | bucket default |

A failed upload request cleans up inline (object and pending row), so orphans only come from crashes mid-request; the cron removes those within a day.

## Troubleshooting

**A file 404s on the delivery route.** Check the asset is published (`GET /api/v1/assets/:id`, `sys.status`), that the URL is the current `fields.url` (an old `fileId` answers `302`), and that the space in the URL is the asset's space. Drafts need `Authorization` with preview access.

**Storage usage grows without new assets.** Look for failing `delete-file` / `delete-replaced-file` handlers in Sentry and for undelivered events (`select type, attempts, last_error from events.outbox where dispatched_at is null and type like 'asset.%'`). Pending uploads older than a day mean the cleanup job isn't running (check the cron trigger).

**Uploads fail with `400 Missing Content-Length`.** The client sent a chunked body. Send the file with a known length (browsers do for `File`/`Blob`), or use a multipart upload.

**Uploads over ~100 MB fail before reaching the Worker.** That's the Workers request body limit of the plan; use a multipart upload (parts ≤ 90 MiB).

## Staging verification (2026-09-26)

Real R2 (`blixis-assets-staging`, WEUR): a PNG with `Content-Digest` uploaded in 410 ms with a matching SHA-256 and dimensions; a disguised script and a wrong digest were refused without storing anything; a 12 MiB multipart upload (10 + 2 MiB) completed; replacement, publish, unpublish, and delete behaved as specified.

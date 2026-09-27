# Webhooks — receiver contract

What a webhook endpoint receives from Blixis (plan 015). Configuring webhooks is documented in the manual: [Webhooks API](../../apps/docs/src/content/docs/content/webhooks-api.mdx).

## Body

Every delivery is an HTTPS `POST` with `Content-Type: application/json` and this body — a versioned public contract:

```json
{
  "id": "01a0e3c1-5b2a-7f10-9c4e-6d2b8a1f0e77",
  "type": "entry.published",
  "version": 1,
  "createdAt": "2026-09-27T10:00:00.000Z",
  "spaceId": "01a0da7b-564f-71d1-a1d7-a16911bb8e67",
  "environmentId": "01a0da7b-5650-7aa4-8c0e-1f2e3d4c5b6a",
  "data": { "entryId": "…", "contentTypeId": "…", "versionId": "…" }
}
```

| Field | Meaning |
|---|---|
| `id` | the event id. Blixis delivers **at least once**: deduplicate on `id` (a redelivery of the same event to the same webhook has the same `id`) |
| `type` | one of the public event types |
| `version` | version of this type's `data`; it only changes for incompatible changes, and a new version is announced |
| `createdAt` | when the event happened (ISO 8601, UTC) |
| `spaceId`, `environmentId` | where it happened |
| `data` | ids only (below). Fetch content through the Delivery or Management API |

## `data` per event type

| Types | `data` |
|---|---|
| `entry.created`, `entry.updated`, `entry.published`, `entry.unpublished`, `entry.deleted` | `entryId`, `contentTypeId`, `versionId` (the version created, published, or last live); `entry.updated` after a restore adds `restoredFrom` |
| `content-type.created`, `content-type.updated`, `content-type.deleted` | `contentTypeId`, `apiId`, `kind` (`entry` or `component`), `version` |
| `asset.created`, `asset.updated`, `asset.published`, `asset.unpublished`, `asset.deleted` | `assetId`, `version` |

Fields are added only in a compatible way (new optional fields); receivers must ignore unknown fields.

## How deliveries are created

- Each event creates **one delivery per matching, active webhook** of the space (`eventTypes` pattern, and `environmentId` when the webhook is limited to one).
- Delivery rows are unique per webhook and event: a redelivered internal event never produces a second delivery.
- Headers, signatures, retries, and timeouts: see *Signatures and retries* (plan 015.003).

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

## Request

```http
POST /your/endpoint HTTP/1.1
Content-Type: application/json
User-Agent: Blixis-Webhooks/1.0
Blixis-Delivery-Id: 01a0e3c2-…        same on every retry of this delivery
Blixis-Event-Id: 01a0e3c1-…           = body.id
Blixis-Event-Type: entry.published
Blixis-Signature: t=1790499600,v1=5f0c…

{ "id": "01a0e3c1-…", "type": "entry.published", … }
```

Answer with any **2xx** within **10 seconds**. Do the work asynchronously if it takes longer (queue a rebuild, answer `202`).

## Verify the signature

`Blixis-Signature` is `t=<unix seconds>,v1=<hex>`, where `v1` is HMAC-SHA256 over `<t>.<raw body>` with the webhook secret (the whole `whsec_…` string). Verify it before trusting a request, and reject old timestamps so captured requests can't be replayed:

```ts
// Works in Node 20+, Deno, Bun, and Cloudflare Workers (Web Crypto).
export async function verifyBlixisSignature(
  secret: string,
  header: string | null,
  rawBody: string,
  toleranceSeconds = 300,
): Promise<boolean> {
  const fields = new Map<string, string[]>()
  for (const part of (header ?? '').split(',')) {
    const [key, value] = part.trim().split('=')
    if (key && value) fields.set(key, [...(fields.get(key) ?? []), value])
  }
  const t = Number(fields.get('t')?.[0])
  if (!Number.isInteger(t) || Math.abs(Date.now() / 1000 - t) > toleranceSeconds) return false
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${rawBody}`))
  const expected = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
  // Compare in constant time.
  return (fields.get('v1') ?? []).some(
    (v) => v.length === expected.length && [...v].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0,
  )
}

// e.g. in a Worker or any Fetch-API server:
export default {
  async fetch(request: Request, env: { BLIXIS_WEBHOOK_SECRET: string }) {
    const body = await request.text() // the raw body: verify before JSON.parse
    if (!(await verifyBlixisSignature(env.BLIXIS_WEBHOOK_SECRET, request.headers.get('blixis-signature'), body)))
      return new Response('invalid signature', { status: 401 })
    const event = JSON.parse(body)
    // … deduplicate on event.id, then act
    return new Response(null, { status: 204 })
  },
}
```

- Use the **raw** body: re-serializing parsed JSON changes the bytes and the signature.
- During a secret rotation, accept both the old and the new secret for a short while.
- `@blixis/webhooks` exports the same logic as `verifyWebhookSignature` (tested against real deliveries).

## Retries

| Receiver answers | Blixis |
|---|---|
| 2xx | done (`succeeded`) |
| 408, 429, 5xx, a redirect (redirects are not followed), a timeout, or a network error | retries: after about 1 min, 5 min, 15 min, 1 h, 3 h, 6 h, 12 h (±20%), 8 attempts over ~22 hours; then `failed` |
| any other 4xx (400, 401, 403, 404, 410, 422 …) | gives up at once (`abandoned`): the receiver rejected the request |

- **Delivery order isn't guaranteed**, especially across retries: use `createdAt` and re-fetch current state instead of assuming order.
- **After 50 consecutive failed attempts** (across deliveries) Blixis **disables** the webhook (`active: false`, `disabledReason` set) and stops sending. Fix the endpoint, then reactivate it with `PATCH /api/v1/webhooks/:id { "active": true }`.
- Every attempt is logged (status, duration, error, the first 1 KB of your response; never headers). Delivery logs and manual redelivery: see the manual (015.004).


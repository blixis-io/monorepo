import type { EventEnvelope } from '@blixis-io/contracts'

/**
 * The public body of a webhook delivery (plan 015.002) — a versioned integration contract:
 *
 * ```json
 * { "id": "<event id>", "type": "entry.published", "version": 1,
 *   "createdAt": "2026-09-27T10:00:00.000Z", "spaceId": "…", "environmentId": "…",
 *   "data": { "entryId": "…", "contentTypeId": "…", "versionId": "…" } }
 * ```
 *
 * `data` carries ids only; receivers fetch content through the APIs. `id` is the event id: the
 * same event always has the same id, so receivers can deduplicate.
 */
export interface WebhookBody {
  readonly id: string
  readonly type: string
  /** Version of this event type's `data`; bumped only for incompatible changes. */
  readonly version: number
  readonly createdAt: string
  readonly spaceId: string
  readonly environmentId: string | null
  readonly data: Readonly<Record<string, unknown>>
}

type Payload = Readonly<Record<string, unknown>>
const pick = (payload: Payload, keys: readonly string[]) =>
  Object.fromEntries(keys.filter((k) => payload[k] !== undefined).map((k) => [k, payload[k]]))

/**
 * Public `data` per event group: an explicit allow-list, so internal fields (organization ids,
 * storage keys) never reach receivers even when event payloads grow.
 */
const DATA: Readonly<Record<string, readonly string[]>> = {
  entry: ['entryId', 'contentTypeId', 'versionId', 'restoredFrom'],
  'content-type': ['contentTypeId', 'apiId', 'kind', 'version'],
  asset: ['assetId', 'version'],
}

export function webhookBody(envelope: EventEnvelope): WebhookBody {
  const payload = (envelope.payload ?? {}) as Payload
  const group = envelope.type.split('.')[0] ?? ''
  return {
    id: envelope.id,
    type: envelope.type,
    version: envelope.version,
    createdAt: envelope.timestamp,
    spaceId: String(payload['spaceId'] ?? envelope.spaceId ?? ''),
    environmentId: typeof payload['environmentId'] === 'string' ? payload['environmentId'] : null,
    data: pick(payload, DATA[group] ?? []),
  }
}

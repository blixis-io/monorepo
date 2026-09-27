/**
 * Event types webhooks may subscribe to: the documented public integration events. Internal
 * events (users, memberships, auth) are never sent to webhooks.
 */
export const PUBLIC_WEBHOOK_EVENTS: readonly string[] = Object.freeze([
  'entry.created',
  'entry.updated',
  'entry.published',
  'entry.unpublished',
  'entry.deleted',
  'content-type.created',
  'content-type.updated',
  'content-type.deleted',
  'asset.created',
  'asset.updated',
  'asset.published',
  'asset.unpublished',
  'asset.deleted',
])

/**
 * Whether a subscription pattern matches an event type: an exact type, a group such as
 * `entry.*`, or `*` for every public event.
 */
export function matchesEventType(pattern: string, type: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('.*')) return type.startsWith(pattern.slice(0, -1))
  return pattern === type
}

/** A pattern is valid when it names at least one public event. */
export const isValidEventPattern = (pattern: string): boolean =>
  PUBLIC_WEBHOOK_EVENTS.some((type) => matchesEventType(pattern, type))

/** A webhook: where to send which events of a space (§15, plan 015). */
export interface Webhook {
  readonly id: string
  readonly organizationId: string
  readonly spaceId: string
  /** Only events of this environment; `null` for every environment of the space. */
  readonly environmentId: string | null
  readonly name: string
  readonly url: string
  /** Exact types, `group.*`, or `*`. */
  readonly eventTypes: readonly string[]
  /** The signing secret, encrypted at rest (AES-GCM). */
  readonly secretEncrypted: string
  /** Last characters of the secret, to recognise it (`whsec_…a1b2`). */
  readonly secretHint: string
  readonly active: boolean
  /** Consecutive failed deliveries (reset on success). */
  readonly failureCount: number
  /** Why the webhook was disabled automatically, if it was. */
  readonly disabledReason: string | null
  readonly version: number
  readonly createdBy: string
  readonly updatedBy: string
  readonly createdAt: string
  readonly updatedAt: string
}

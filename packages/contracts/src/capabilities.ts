/**
 * Identifier of a capability a module provides or requires (architecture §8).
 *
 * Convention: `<namespace>.<capability>` in lowercase kebab-case segments, e.g. `blixis.assets`,
 * `acme.seo`. The `blixis.` namespace is reserved for first-party modules.
 */
export type CapabilityId = `${string}.${string}`

/** First-party capability identifiers planned by the architecture. */
export const BLIXIS_CAPABILITIES = Object.freeze({
  auth: 'blixis.auth',
  users: 'blixis.users',
  spaces: 'blixis.spaces',
  permissions: 'blixis.permissions',
  content: 'blixis.content',
  assets: 'blixis.assets',
  webhooks: 'blixis.webhooks',
  releases: 'blixis.releases',
  events: 'blixis.events',
  database: 'blixis.database',
} as const satisfies Record<string, CapabilityId>)

/** Union of first-party capability identifiers. */
export type BlixisCapabilityId = (typeof BLIXIS_CAPABILITIES)[keyof typeof BLIXIS_CAPABILITIES]

const CAPABILITY_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/

/** Whether `value` follows the capability naming convention. */
export function isCapabilityId(value: string): value is CapabilityId {
  return CAPABILITY_PATTERN.test(value)
}

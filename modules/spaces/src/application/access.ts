import { type Actor, type ResourceRef, UnauthorizedError } from '@blixis/contracts'

/**
 * The user an actor acts for: users themselves, API tokens their owner (§30). Only for data that
 * belongs to the user (their organization list, the creator of an organization) — access
 * decisions go through `AUTHORIZATION_SERVICE`.
 */
export function actingUserId(actor: Actor): string {
  if (actor.type === 'user') return actor.userId
  if (actor.type === 'apiToken') return actor.ownerId
  throw new UnauthorizedError('Sign in to access organizations and spaces')
}

/** An organization as an authorization resource (§31: always with its tenant ids). */
export const organizationResource = (organizationId: string): ResourceRef => ({
  type: 'organization',
  id: organizationId,
  organizationId,
})

/** A space as an authorization resource. */
export const spaceResource = (tenant: {
  readonly organizationId: string
  readonly spaceId: string
}): ResourceRef => ({
  type: 'space',
  id: tenant.spaceId,
  organizationId: tenant.organizationId,
  spaceId: tenant.spaceId,
})

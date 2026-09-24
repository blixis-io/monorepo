import {
  type Actor,
  ANONYMOUS_ACTOR,
  type AnonymousActor,
  type ApiTokenActor,
  type DeliveryKeyActor,
  type PermissionId,
  type SystemActor,
  type UserActor,
} from '@blixis/contracts'

/** A signed-in user actor. */
export function asUser(userId: string): UserActor {
  return { type: 'user', userId }
}

/** An API-token actor. */
export function asApiToken(
  ownerId: string,
  scopes: readonly PermissionId[] = [],
  tokenId = `tok_${ownerId}`,
): ApiTokenActor {
  return { type: 'apiToken', tokenId, ownerId, scopes }
}

/** A delivery or preview key actor for a space. */
export function asDeliveryKey(
  spaceId: string,
  kind: 'delivery' | 'preview' = 'delivery',
  keyId = `key_${spaceId}`,
): DeliveryKeyActor {
  return { type: 'deliveryKey', keyId, spaceId, kind }
}

/** A platform component actor. */
export function asSystem(component = '@blixis/testing'): SystemActor {
  return { type: 'system', component }
}

/** The anonymous actor. */
export function asAnonymous(): AnonymousActor {
  return ANONYMOUS_ACTOR
}

/** Header used by test requests to choose the actor per request. */
export const TEST_ACTOR_HEADER = 'x-blixis-test-actor'

/** Encodes an actor for {@link TEST_ACTOR_HEADER}. */
export function encodeTestActor(actor: Actor): string {
  return JSON.stringify(actor)
}

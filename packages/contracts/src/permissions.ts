import { createServiceToken } from './services.ts'

/**
 * Who performs an action (authentication result, architecture §30). Produced by actor
 * resolvers (e.g. `@blixis/auth`); consumed by authorization and services.
 */
export type Actor = UserActor | ApiTokenActor | DeliveryKeyActor | SystemActor | AnonymousActor

/** A signed-in user (session). */
export interface UserActor {
  readonly type: 'user'
  readonly userId: string
}

/** A personal API token; permissions are the owner's intersected with `scopes`. */
export interface ApiTokenActor {
  readonly type: 'apiToken'
  readonly tokenId: string
  readonly ownerId: string
  readonly scopes: readonly PermissionId[]
}

/** A space-scoped content delivery or preview key. */
export interface DeliveryKeyActor {
  readonly type: 'deliveryKey'
  readonly keyId: string
  readonly spaceId: string
  readonly kind: 'delivery' | 'preview'
}

/** Platform code acting on its own behalf (queue consumers, cron jobs, Workflows). */
export interface SystemActor {
  readonly type: 'system'
  /** Component name, e.g. `@blixis/events.outbox`. */
  readonly component: string
  /** Actor that originally triggered the work, when known. */
  readonly onBehalfOf?: string
}

/** No credentials presented. */
export interface AnonymousActor {
  readonly type: 'anonymous'
}

/** The anonymous actor singleton. */
export const ANONYMOUS_ACTOR: AnonymousActor = Object.freeze({ type: 'anonymous' })

/** Whether the actor is a signed-in user. */
export function isUserActor(actor: Actor): actor is UserActor {
  return actor.type === 'user'
}

/** Whether the actor is anonymous. */
export function isAnonymousActor(actor: Actor): actor is AnonymousActor {
  return actor.type === 'anonymous'
}

/** Stable identifier of an actor for logs and audit metadata (never contains secrets). */
export function actorId(actor: Actor): string {
  switch (actor.type) {
    case 'user':
      return `user:${actor.userId}`
    case 'apiToken':
      return `apiToken:${actor.tokenId}`
    case 'deliveryKey':
      return `deliveryKey:${actor.keyId}`
    case 'system':
      return `system:${actor.component}`
    case 'anonymous':
      return 'anonymous'
  }
}

/**
 * Permission identifier: `<module>.<action>` or `<module>.<resource>.<action>`, lowercase,
 * e.g. `content.publish`, `spaces.settings.write` (§30). The first segment is the namespace
 * of the declaring module.
 */
export type PermissionId = `${string}.${string}`

const PERMISSION_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-zA-Z0-9-]*){1,2}$/

/** Whether `value` follows the permission naming convention. */
export function isPermissionId(value: string): value is PermissionId {
  return PERMISSION_PATTERN.test(value)
}

/**
 * Built-in roles every organization has (plan 009). Roles are configuration, evaluated only by
 * `@blixis/permissions` — code checks permissions, never role names (§30). `owner` holds every
 * permission and is assignable only at organization level.
 */
export const SYSTEM_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const

/** Key of a {@link SYSTEM_ROLES | system role}. */
export type SystemRoleKey = (typeof SYSTEM_ROLES)[number]

/** Whether `value` is a system role key. */
export function isSystemRoleKey(value: string): value is SystemRoleKey {
  return (SYSTEM_ROLES as readonly string[]).includes(value)
}

/** A permission contributed by a module (module contract `permissions`). */
export interface PermissionDefinition {
  readonly id: PermissionId
  readonly description: string
  /** Tenant level at which the permission is granted. Defaults to `space`. */
  readonly scope?: 'organization' | 'space'
  /**
   * System roles granted this permission by default. `owner` always holds every permission, so
   * listing it is optional; a permission without `defaultRoles` is owner-only (or granted
   * through custom roles).
   */
  readonly defaultRoles?: readonly SystemRoleKey[]
}

/** Declares a permission with a runtime naming check. */
export function definePermission(definition: PermissionDefinition): PermissionDefinition {
  if (!isPermissionId(definition.id)) {
    throw new TypeError(
      `Invalid permission id "${definition.id}": use "<module>.<action>" or "<module>.<resource>.<action>"`,
    )
  }
  const unknownRoles = (definition.defaultRoles ?? []).filter((role) => !isSystemRoleKey(role))
  if (unknownRoles.length > 0) {
    throw new TypeError(
      `Permission "${definition.id}" grants unknown default roles: ${unknownRoles.join(', ')}`,
    )
  }
  return Object.freeze({
    ...definition,
    ...(definition.defaultRoles === undefined
      ? {}
      : { defaultRoles: Object.freeze([...definition.defaultRoles]) }),
  })
}

/**
 * The resource an action targets. Tenant-scoped resources must carry `organizationId` and/or
 * `spaceId` so ownership is always verified — never trust an id alone (§31).
 */
export interface ResourceRef {
  /** Resource type, e.g. `entry`, `space`, `organization`. */
  readonly type: string
  readonly id?: string
  readonly organizationId?: string
  readonly spaceId?: string
}

/** One authorization question: may `actor` perform `action` on `resource`? */
export interface AuthorizationCheck {
  readonly actor: Actor
  readonly action: PermissionId
  readonly resource: ResourceRef
  /** Allow `system` actors for this call. Defaults to `false` (deny by default). */
  readonly allowSystem?: boolean
}

/** Authorization service (implemented by `@blixis/permissions`, plan 009). */
export interface AuthorizationService {
  /** Returns whether the check passes. */
  can(check: AuthorizationCheck): Promise<boolean>
  /**
   * Throws when the check fails.
   * @throws UnauthorizedError for anonymous actors.
   * @throws ForbiddenError for authenticated actors without the permission.
   */
  require(check: AuthorizationCheck): Promise<void>
}

/** Service token for {@link AuthorizationService}. */
export const AUTHORIZATION_SERVICE = createServiceToken<AuthorizationService>(
  '@blixis/permissions.authorization',
)

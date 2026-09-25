import {
  type Actor,
  type AuthorizationCheck,
  type AuthorizationService,
  actorId,
  createServiceToken,
  ForbiddenError,
  type Logger,
  ModuleError,
  NotFoundError,
  type PermissionId,
  type ResourceRef,
  type ServiceToken,
  UnauthorizedError,
} from '@blixis/contracts'
import type { Membership, MembershipService } from '@blixis/users'
import type { PermissionCatalog } from './catalog.ts'
import type { RoleStore } from './role.store.ts'

/** An organization, or a space inside it. */
export interface Tenant {
  readonly organizationId: string
  readonly spaceId?: string | undefined
}

/** Why a check was denied: drives the error `require` throws. */
type Denial = 'anonymous' | 'no-access' | 'forbidden'
type Decision = { readonly allowed: true } | { readonly allowed: false; readonly denial: Denial }

/**
 * The permissions implementation of {@link AuthorizationService}, plus what role management
 * needs on top (internal to `@blixis/permissions`).
 */
export interface Authorizer extends AuthorizationService {
  /**
   * Permissions the actor holds in a tenant: at organization level those of the organization
   * membership; in a space also the space-scoped permissions of the space membership. API
   * tokens are limited to their scopes. `undefined` when the actor has no membership there.
   */
  permissionsIn(actor: Actor, tenant: Tenant): Promise<ReadonlySet<PermissionId> | undefined>
}

/** Request-scoped {@link Authorizer} (internal; others use `AUTHORIZATION_SERVICE`). */
export const AUTHORIZER: ServiceToken<Authorizer> = createServiceToken<Authorizer>(
  '@blixis/permissions.authorizer',
)

const OWNER = '@blixis/permissions'
const EMPTY: ReadonlySet<PermissionId> = new Set()

const notFound = (resource: ResourceRef) =>
  new NotFoundError(`${resource.type.charAt(0).toUpperCase()}${resource.type.slice(1)} not found`)

/**
 * Creates the authorizer of one request scope (architecture §30, §31). Deny by default:
 * - `anonymous` → denied (`UnauthorizedError`);
 * - `user` → permissions of their organization and space memberships for the resource's tenant;
 * - `apiToken` → the owner's permissions ∩ the token's scopes (tokens without scopes can do
 *   nothing);
 * - `deliveryKey` → denied until delivery permissions exist (plan 012);
 * - `system` → allowed only when the call passes `allowSystem: true`.
 *
 * Memberships are loaded once per user and request; custom roles once per organization.
 */
export function createAuthorizer(deps: {
  readonly catalog: PermissionCatalog
  readonly roles: RoleStore
  readonly memberships: MembershipService
  /** The request's logger (read per call: tenant binding replaces it). */
  readonly logger: () => Logger
  /** The request's verified tenant, if one is bound (`spaceScoped()`). */
  readonly boundTenant: () => { organizationId?: string; spaceId?: string }
}): Authorizer {
  const { catalog, roles, memberships, logger } = deps
  const loaded = new Map<string, Promise<Membership[]>>()
  const membershipsOf = (userId: string) => {
    let result = loaded.get(userId)
    if (result === undefined) {
      result = memberships.listMembershipsForUser(userId)
      loaded.set(userId, result)
    }
    return result
  }

  async function permissionsIn(
    actor: Actor,
    tenant: Tenant,
  ): Promise<ReadonlySet<PermissionId> | undefined> {
    if (actor.type !== 'user' && actor.type !== 'apiToken') return undefined
    const userId = actor.type === 'user' ? actor.userId : actor.ownerId
    const own = (await membershipsOf(userId)).filter(
      (m) => m.organizationId === tenant.organizationId,
    )
    const organization = own.find((m) => m.spaceId === null)
    const space =
      tenant.spaceId === undefined ? undefined : own.find((m) => m.spaceId === tenant.spaceId)
    if (organization === undefined && space === undefined) return undefined

    const granted = new Set<PermissionId>(
      organization === undefined
        ? EMPTY
        : await roles.permissionsOf(tenant.organizationId, organization.role),
    )
    if (space !== undefined) {
      for (const id of await roles.permissionsOf(tenant.organizationId, space.role)) {
        // A space membership never grants organization-level permissions.
        if (catalog.get(id)?.scope === 'space') granted.add(id)
      }
    }
    if (actor.type === 'apiToken') {
      const scopes = new Set<string>(actor.scopes)
      for (const id of granted) if (!scopes.has(id)) granted.delete(id)
    }
    return granted
  }

  async function decide(check: AuthorizationCheck): Promise<Decision> {
    const { actor, action, resource } = check
    const permission = catalog.assertKnown(action)
    switch (actor.type) {
      case 'anonymous':
        return { allowed: false, denial: 'anonymous' }
      case 'system':
        return check.allowSystem === true
          ? { allowed: true }
          : { allowed: false, denial: 'forbidden' }
      case 'deliveryKey':
        return { allowed: false, denial: 'forbidden' }
      case 'user':
      case 'apiToken':
        break
    }
    const { organizationId, spaceId } = resource
    if (organizationId === undefined || (permission.scope === 'space' && spaceId === undefined)) {
      throw new ModuleError(
        OWNER,
        `Checking ${action} (${permission.scope} scope) needs a resource with ${
          permission.scope === 'space' ? 'organizationId and spaceId' : 'organizationId'
        } (§31)`,
      )
    }
    // The resource must belong to the tenant this request is bound to, if any.
    const bound = deps.boundTenant()
    if (
      (bound.organizationId !== undefined && bound.organizationId !== organizationId) ||
      (bound.spaceId !== undefined && spaceId !== undefined && bound.spaceId !== spaceId)
    ) {
      return { allowed: false, denial: 'no-access' }
    }
    const held = await permissionsIn(actor, {
      organizationId,
      spaceId: permission.scope === 'space' ? spaceId : undefined,
    })
    if (held === undefined) return { allowed: false, denial: 'no-access' }
    return held.has(action) ? { allowed: true } : { allowed: false, denial: 'forbidden' }
  }

  async function logged(check: AuthorizationCheck): Promise<Decision> {
    const decision = await decide(check)
    logger().debug('authorization', {
      actor: actorId(check.actor),
      action: check.action,
      resource: check.resource.type,
      ...(check.resource.id === undefined ? {} : { resourceId: check.resource.id }),
      decision: decision.allowed ? 'allow' : decision.denial,
    })
    return decision
  }

  return {
    permissionsIn,
    async can(check) {
      return (await logged(check)).allowed
    },
    async require(check) {
      const decision = await logged(check)
      if (decision.allowed) return
      switch (decision.denial) {
        case 'anonymous':
          throw new UnauthorizedError('Sign in to continue')
        case 'no-access':
          throw notFound(check.resource)
        case 'forbidden':
          throw new ForbiddenError('You do not have permission to do this')
      }
    },
  }
}

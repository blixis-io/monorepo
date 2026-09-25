import {
  type Actor,
  createServiceToken,
  type ModuleHonoEnv,
  NotFoundError,
  type ServiceToken,
  TENANT_BINDER,
} from '@blixis/contracts'
import { type Database, isId } from '@blixis/database'
import type { MembershipService } from '@blixis/users'
import type { Context, Next } from 'hono'
import { environmentRepository, spaceRepository } from '../infrastructure/repositories.ts'
import { actingUserId, requireSpaceAccess } from './access.ts'

/** A verified tenant for one space and environment. */
export interface ResolvedTenant {
  readonly organizationId: string
  readonly spaceId: string
  readonly environmentId: string
  readonly environmentKey: string
}

/**
 * Resolves and verifies the tenant of a request (architecture §31, plan 008). Request-scoped and
 * memoised: resolving the same space twice in one request costs one lookup.
 */
export interface TenantResolver {
  /**
   * Loads the space, verifies the actor may access it (users and API tokens through the owner's
   * memberships; `system` actors are trusted but the space must exist), and resolves the
   * environment (`environmentKey`, or the space's default).
   * @throws NotFoundError for unknown spaces/environments and spaces the actor cannot access
   * @throws UnauthorizedError for anonymous actors
   */
  resolveSpace(actor: Actor, spaceId: string, environmentKey?: string): Promise<ResolvedTenant>
}

/** Request-scoped {@link TenantResolver}, provided by `spacesModule()`. */
export const TENANT_RESOLVER: ServiceToken<TenantResolver> = createServiceToken<TenantResolver>(
  '@blixis/spaces.tenant-resolver',
)

export function createTenantResolver(deps: {
  readonly db: Database
  readonly memberships: MembershipService
}): TenantResolver {
  const memo = new Map<string, Promise<ResolvedTenant>>()

  async function resolve(
    actor: Actor,
    spaceId: string,
    environmentKey: string | undefined,
  ): Promise<ResolvedTenant> {
    if (!isId(spaceId)) throw new NotFoundError('Space not found')
    const space = await spaceRepository.findForResolution(deps.db, spaceId)
    if (space === undefined) throw new NotFoundError('Space not found')
    if (actor.type !== 'system') {
      await requireSpaceAccess(
        deps.memberships,
        actingUserId(actor),
        space.organizationId,
        space.id,
      )
    }
    const tenant = { organizationId: space.organizationId, spaceId: space.id }
    const environments = await environmentRepository.list(deps.db, tenant)
    const environment =
      environmentKey === undefined
        ? environments.find((e) => e.isDefault)
        : environments.find((e) => e.key === environmentKey)
    if (environment === undefined) throw new NotFoundError('Environment not found')
    return { ...tenant, environmentId: environment.id, environmentKey: environment.key }
  }

  return {
    resolveSpace(actor, spaceId, environmentKey) {
      const actorKey =
        actor.type === 'user'
          ? actor.userId
          : actor.type === 'apiToken'
            ? actor.tokenId
            : actor.type
      const key = `${actorKey}|${spaceId}|${environmentKey ?? ''}`
      let result = memo.get(key)
      if (result === undefined) {
        result = resolve(actor, spaceId, environmentKey)
        memo.set(key, result)
      }
      return result
    },
  }
}

/**
 * Hono middleware for space-scoped routes (§31): resolves `:spaceId` (and `:environment` or
 * `?environment=`) for the request's actor, then binds the verified tenant to the request
 * context — `c.var.requestContext.tenant` and every service resolved afterwards see it.
 *
 * @example
 * routes.get('/spaces/:spaceId/entries', spaceScoped(), async (c) => {
 *   const tenant = requireTenant(c.var.requestContext, 'organizationId', 'spaceId', 'environmentId')
 *   …
 * })
 */
export function spaceScoped() {
  return async (c: Context<ModuleHonoEnv>, next: Next): Promise<void> => {
    const spaceId = c.req.param('spaceId')
    if (spaceId === undefined) throw new Error('spaceScoped() needs a :spaceId route parameter')
    const environmentKey = c.req.param('environment') ?? c.req.query('environment')
    const tenant = await c.var.services
      .get(TENANT_RESOLVER)
      .resolveSpace(c.var.requestContext.actor, spaceId, environmentKey)
    const context = c.var.services.get(TENANT_BINDER).bind({
      organizationId: tenant.organizationId,
      spaceId: tenant.spaceId,
      environmentId: tenant.environmentId,
    })
    c.set('requestContext', context)
    await next()
  }
}

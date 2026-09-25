import {
  type Actor,
  type AuthorizationService,
  createServiceToken,
  type EventBus,
  ForbiddenError,
  NotFoundError,
  OWNER_ROLE,
  type PermissionId,
  type ServiceToken,
  type SystemRoleKey,
  validate,
} from '@blixis/contracts'
import { type Database, isId, toTransactionScope, withTransaction } from '@blixis/database'
import type { MembershipService } from '@blixis/users'
import { z } from 'zod'
import {
  DEFAULT_ENVIRONMENT_KEY,
  type Environment,
  type Locale,
  localeCodeSchema,
  nameSchema,
  type Organization,
  type Space,
  slugSchema,
} from '../domain/tenancy.ts'
import { organizationCreated, spaceCreated, spaceDeleted, spaceUpdated } from '../events.ts'
import {
  environmentRepository,
  localeRepository,
  organizationRepository,
  spaceRepository,
} from '../infrastructure/repositories.ts'
import { SPACES_PERMISSIONS as P } from '../permissions.ts'
import { actingUserId, organizationResource, spaceResource } from './access.ts'

/** A space with its environments and locales. */
export interface SpaceDetails extends Space {
  readonly environments: readonly Environment[]
  readonly locales: readonly Locale[]
}

/**
 * Role the creator of a space gets in it, so they can manage the space they created even with a
 * custom organization role that only grants `spaces.create`.
 */
const SPACE_CREATOR_ROLE = 'admin' satisfies SystemRoleKey

/**
 * Organizations and spaces on behalf of an actor. Every operation checks a permission through
 * `AUTHORIZATION_SERVICE` (§30): non-members get `NotFoundError`, members without the permission
 * `ForbiddenError`. Request-scoped: `services.get(TENANCY_SERVICE)`.
 */
export interface TenancyService {
  /**
   * Creates an organization with the acting user as owner. Users only: API tokens cannot create
   * organizations (no scope covers it). @throws ForbiddenError for other actors
   */
  createOrganization(actor: Actor, input: { name: string; slug: string }): Promise<Organization>
  /** Organizations the user belongs to (directly or through a space membership). */
  listOrganizations(actor: Actor): Promise<Organization[]>
  /** Needs `organizations.read`. */
  getOrganization(actor: Actor, organizationId: string): Promise<Organization>
  /** Needs `organizations.settings.write`. */
  renameOrganization(
    actor: Actor,
    organizationId: string,
    input: { name?: string; slug?: string },
  ): Promise<Organization>
  /**
   * Needs `spaces.create`. Creates the space with its `main` environment and default locale; the
   * acting user becomes space admin.
   */
  createSpace(
    actor: Actor,
    organizationId: string,
    input: { name: string; slug: string; defaultLocale?: string },
  ): Promise<SpaceDetails>
  /** Needs `organizations.read`. */
  listSpaces(actor: Actor, organizationId: string): Promise<Space[]>
  /** A space by id (its organization is looked up); needs `spaces.read`. */
  getSpace(actor: Actor, spaceId: string): Promise<SpaceDetails>
  /** Needs `spaces.settings.write`. */
  updateSpace(
    actor: Actor,
    spaceId: string,
    input: { name?: string; slug?: string },
  ): Promise<Space>
  /** Needs `spaces.delete`. Emits `space.deleted` for modules to delete their data. */
  deleteSpace(actor: Actor, spaceId: string): Promise<void>
}

/** Request-scoped {@link TenancyService}, provided by `spacesModule()`. */
export const TENANCY_SERVICE: ServiceToken<TenancyService> =
  createServiceToken<TenancyService>('@blixis/spaces.tenancy')

const organizationInput = z.object({ name: nameSchema, slug: slugSchema })
const organizationPatch = z.object({ name: nameSchema.optional(), slug: slugSchema.optional() })
const spaceInput = z.object({
  name: nameSchema,
  slug: slugSchema,
  defaultLocale: localeCodeSchema.optional(),
})
const spacePatch = organizationPatch

/** Creates the {@link TenancyService} of one request scope. */
export function createTenancyService(deps: {
  readonly db: Database
  readonly memberships: MembershipService
  readonly events: EventBus
  readonly authz: AuthorizationService
}): TenancyService {
  const { db, memberships, events, authz } = deps

  /** Finds a space and checks `action` on it; 404 for both "missing" and "not yours" (§31). */
  async function authorizedSpace(actor: Actor, spaceId: string, action: PermissionId) {
    const space = isId(spaceId) ? await spaceRepository.findForResolution(db, spaceId) : undefined
    if (space === undefined) throw new NotFoundError('Space not found')
    await authz.require({
      actor,
      action,
      resource: spaceResource({ organizationId: space.organizationId, spaceId: space.id }),
    })
    return space
  }
  const requireOrganization = (actor: Actor, organizationId: string, action: PermissionId) =>
    authz.require({ actor, action, resource: organizationResource(organizationId) })

  async function details(space: Space): Promise<SpaceDetails> {
    const tenant = { organizationId: space.organizationId, spaceId: space.id }
    return {
      ...space,
      environments: await environmentRepository.list(db, tenant),
      locales: await localeRepository.list(db, tenant),
    }
  }

  const service: TenancyService = {
    async createOrganization(actor, input) {
      if (actor.type !== 'user') {
        actingUserId(actor)
        throw new ForbiddenError('Only signed-in users can create organizations')
      }
      const values = await validate(organizationInput, input, { message: 'Invalid organization' })
      const organization = await withTransaction(db, async (tx) => {
        const created = await organizationRepository.insert(tx, values)
        await memberships.addOrganizationMember(
          { userId: actor.userId, organizationId: created.id, role: OWNER_ROLE },
          { transaction: toTransactionScope(tx) },
        )
        return created
      })
      await events.emit(organizationCreated, {
        organizationId: organization.id,
        slug: organization.slug,
        createdBy: actor.userId,
      })
      return organization
    },

    async listOrganizations(actor) {
      const own = await memberships.listMembershipsForUser(actingUserId(actor))
      return organizationRepository.findManyByIds(db, [
        ...new Set(own.map((m) => m.organizationId)),
      ])
    },

    async getOrganization(actor, organizationId) {
      await requireOrganization(actor, organizationId, P.organizationRead.id)
      return (
        (await organizationRepository.findById(db, organizationId)) ??
        Promise.reject(new NotFoundError('Organization not found'))
      )
    },

    async renameOrganization(actor, organizationId, input) {
      const values = await validate(organizationPatch, input, { message: 'Invalid organization' })
      await requireOrganization(actor, organizationId, P.organizationSettingsWrite.id)
      const updated = await organizationRepository.update(db, organizationId, values)
      if (updated === undefined) throw new NotFoundError('Organization not found')
      return updated
    },

    async createSpace(actor, organizationId, input) {
      const values = await validate(spaceInput, input, { message: 'Invalid space' })
      await requireOrganization(actor, organizationId, P.spaceCreate.id)
      const userId = actingUserId(actor)
      const defaultLocale = values.defaultLocale ?? 'en-US'
      return withTransaction(db, async (tx) => {
        const space = await spaceRepository.insert(tx, {
          organizationId,
          name: values.name,
          slug: values.slug,
        })
        const tenant = { organizationId, spaceId: space.id }
        const environment = await environmentRepository.insert(tx, tenant, {
          key: DEFAULT_ENVIRONMENT_KEY,
          isDefault: true,
        })
        const locale = await localeRepository.insert(tx, tenant, {
          code: defaultLocale,
          name: defaultLocale,
          isDefault: true,
          fallbackCode: null,
        })
        await memberships.addSpaceMember(
          { userId, organizationId, spaceId: space.id, role: SPACE_CREATOR_ROLE },
          { transaction: toTransactionScope(tx) },
        )
        await events.emit(
          spaceCreated,
          {
            spaceId: space.id,
            organizationId,
            slug: space.slug,
            defaultEnvironmentId: environment.id,
            defaultLocale,
          },
          { transaction: toTransactionScope(tx) },
        )
        return { ...space, environments: [environment], locales: [locale] }
      })
    },

    async listSpaces(actor, organizationId) {
      await requireOrganization(actor, organizationId, P.organizationRead.id)
      return spaceRepository.listInOrganization(db, organizationId)
    },

    async getSpace(actor, spaceId) {
      return details(await authorizedSpace(actor, spaceId, P.spaceRead.id))
    },

    async updateSpace(actor, spaceId, input) {
      const values = await validate(spacePatch, input, { message: 'Invalid space' })
      const space = await authorizedSpace(actor, spaceId, P.spaceSettingsWrite.id)
      const updated = await spaceRepository.update(db, space.organizationId, space.id, values)
      if (updated === undefined) throw new NotFoundError('Space not found')
      await events.emit(spaceUpdated, { spaceId: space.id, organizationId: space.organizationId })
      return updated
    },

    async deleteSpace(actor, spaceId) {
      const space = await authorizedSpace(actor, spaceId, P.spaceDelete.id)
      await withTransaction(db, async (tx) => {
        const scope = toTransactionScope(tx)
        await memberships.removeAllForSpace(space.organizationId, space.id, { transaction: scope })
        await spaceRepository.delete(tx, space.organizationId, space.id)
        await events.emit(
          spaceDeleted,
          { spaceId: space.id, organizationId: space.organizationId },
          { transaction: scope },
        )
      })
    },
  }
  return service
}

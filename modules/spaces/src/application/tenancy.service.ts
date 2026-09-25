import {
  createServiceToken,
  type EventBus,
  NotFoundError,
  type ServiceToken,
  validate,
} from '@blixis/contracts'
import { type Database, toTransactionScope, withTransaction } from '@blixis/database'
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
import {
  canManageSpace,
  requireOrganizationManager,
  requireOrganizationMember,
  requireSpaceAccess,
} from './access.ts'

/** A space with its environments and locales. */
export interface SpaceDetails extends Space {
  readonly environments: readonly Environment[]
  readonly locales: readonly Locale[]
}

/**
 * Organizations and spaces, always on behalf of a user (`userId`: the actor, or an API token's
 * owner) whose membership is checked first. Request-scoped: `services.get(TENANCY_SERVICE)`.
 */
export interface TenancyService {
  /** Creates an organization with the creator as owner. */
  createOrganization(userId: string, input: { name: string; slug: string }): Promise<Organization>
  /** Organizations the user belongs to (directly or through a space membership). */
  listOrganizations(userId: string): Promise<Organization[]>
  getOrganization(userId: string, organizationId: string): Promise<Organization>
  renameOrganization(
    userId: string,
    organizationId: string,
    input: { name?: string; slug?: string },
  ): Promise<Organization>
  /** Creates a space with its `main` environment, default locale, and the creator as space admin. */
  createSpace(
    userId: string,
    organizationId: string,
    input: { name: string; slug: string; defaultLocale?: string },
  ): Promise<SpaceDetails>
  /** Spaces of the organization the user can see (all, for organization members). */
  listSpaces(userId: string, organizationId: string): Promise<Space[]>
  /** A space by id — the organization is looked up and the user's access verified. */
  getSpace(userId: string, spaceId: string): Promise<SpaceDetails>
  updateSpace(
    userId: string,
    spaceId: string,
    input: { name?: string; slug?: string },
  ): Promise<Space>
  /** Deletes the space and emits `space.deleted` for modules to delete their data. */
  deleteSpace(userId: string, spaceId: string): Promise<void>
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
}): TenancyService {
  const { db, memberships, events } = deps

  /** Finds a space and verifies access; 404 for both "missing" and "not yours" (§31). */
  async function accessibleSpace(userId: string, spaceId: string) {
    const space = await spaceRepository.findForResolution(db, spaceId)
    if (space === undefined) throw new NotFoundError('Space not found')
    const access = await requireSpaceAccess(memberships, userId, space.organizationId, space.id)
    return { space, access }
  }

  async function details(space: Space): Promise<SpaceDetails> {
    const tenant = { organizationId: space.organizationId, spaceId: space.id }
    return {
      ...space,
      environments: await environmentRepository.list(db, tenant),
      locales: await localeRepository.list(db, tenant),
    }
  }

  const service: TenancyService = {
    async createOrganization(userId, input) {
      const values = await validate(organizationInput, input, { message: 'Invalid organization' })
      const organization = await withTransaction(db, async (tx) => {
        const created = await organizationRepository.insert(tx, values)
        await memberships.addOrganizationMember(
          { userId, organizationId: created.id, role: 'owner' },
          { transaction: toTransactionScope(tx) },
        )
        return created
      })
      await events.emit(organizationCreated, {
        organizationId: organization.id,
        slug: organization.slug,
        createdBy: userId,
      })
      return organization
    },

    async listOrganizations(userId) {
      const own = await memberships.listMembershipsForUser(userId)
      return organizationRepository.findManyByIds(db, [
        ...new Set(own.map((m) => m.organizationId)),
      ])
    },

    async getOrganization(userId, organizationId) {
      await requireOrganizationMember(memberships, userId, organizationId)
      return (
        (await organizationRepository.findById(db, organizationId)) ??
        Promise.reject(new NotFoundError('Organization not found'))
      )
    },

    async renameOrganization(userId, organizationId, input) {
      const values = await validate(organizationPatch, input, { message: 'Invalid organization' })
      await requireOrganizationManager(memberships, userId, organizationId)
      const updated = await organizationRepository.update(db, organizationId, values)
      if (updated === undefined) throw new NotFoundError('Organization not found')
      return updated
    },

    async createSpace(userId, organizationId, input) {
      const values = await validate(spaceInput, input, { message: 'Invalid space' })
      await requireOrganizationManager(memberships, userId, organizationId)
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
          { userId, organizationId, spaceId: space.id, role: 'admin' },
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

    async listSpaces(userId, organizationId) {
      await requireOrganizationMember(memberships, userId, organizationId)
      return spaceRepository.listInOrganization(db, organizationId)
    },

    async getSpace(userId, spaceId) {
      const { space } = await accessibleSpace(userId, spaceId)
      return details(space)
    },

    async updateSpace(userId, spaceId, input) {
      const values = await validate(spacePatch, input, { message: 'Invalid space' })
      const { space, access } = await accessibleSpace(userId, spaceId)
      if (!canManageSpace(access)) throw new NotFoundError('Space not found')
      const updated = await spaceRepository.update(db, space.organizationId, space.id, values)
      if (updated === undefined) throw new NotFoundError('Space not found')
      await events.emit(spaceUpdated, { spaceId: space.id, organizationId: space.organizationId })
      return updated
    },

    async deleteSpace(userId, spaceId) {
      const { space, access } = await accessibleSpace(userId, spaceId)
      if (!canManageSpace(access)) throw new NotFoundError('Space not found')
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

import {
  type Actor,
  createServiceToken,
  ForbiddenError,
  type PermissionId,
  type ServiceToken,
  ValidationError,
} from '@blixis/contracts'
import type { CreateRoleInput, Role, UpdateRoleInput } from '../domain/role.ts'
import { ROLE_PERMISSIONS } from '../permissions.ts'
import type { Authorizer, Tenant } from './authorization.service.ts'
import type { PermissionCatalog } from './catalog.ts'
import type { RoleStore } from './role.store.ts'

/**
 * Role management on behalf of an actor (plan 009). Reading needs `roles.read`, changing needs
 * `roles.manage` — and never more than the actor holds: a role can only be created, changed,
 * deleted, or granted by someone holding every permission in it (escalation guard). This is
 * also why only owners can grant `owner`. Request-scoped: `services.get(ROLE_SERVICE)`.
 */
export interface RoleService {
  /** @throws NotFoundError (not a member), ForbiddenError (no `roles.read`) */
  list(actor: Actor, organizationId: string): Promise<readonly Role[]>
  /** @throws NotFoundError, ForbiddenError */
  get(actor: Actor, organizationId: string, roleId: string): Promise<Role>
  /** @throws NotFoundError, ForbiddenError, ValidationError, ConflictError */
  create(actor: Actor, organizationId: string, input: CreateRoleInput): Promise<Role>
  /** @throws NotFoundError, ForbiddenError, ValidationError, ConflictError */
  update(
    actor: Actor,
    organizationId: string,
    roleId: string,
    input: UpdateRoleInput,
  ): Promise<Role>
  /** @throws NotFoundError, ForbiddenError, ConflictError (system role, still assigned) */
  delete(actor: Actor, organizationId: string, roleId: string): Promise<void>
  /**
   * Verifies the actor may grant (or take away) `roleKey` at this level: the role exists in the
   * organization, is assignable there, and the actor holds every permission it grants there.
   * Membership services call this before assigning, changing, or removing a role.
   * @throws ValidationError (unknown role, wrong level), ForbiddenError (escalation)
   */
  assertCanGrant(actor: Actor, tenant: Tenant, roleKey: string): Promise<void>
}

/** Request-scoped {@link RoleService}, provided by `permissionsModule()`. */
export const ROLE_SERVICE: ServiceToken<RoleService> = createServiceToken<RoleService>(
  '@blixis/permissions.roles',
)

/** Creates the {@link RoleService} of one request scope. */
export function createRoleService(deps: {
  readonly store: RoleStore
  readonly authorizer: Authorizer
  readonly catalog: PermissionCatalog
}): RoleService {
  const { store, authorizer, catalog } = deps
  const organization = (organizationId: string) => ({
    type: 'organization',
    id: organizationId,
    organizationId,
  })
  const requireRoles = (actor: Actor, organizationId: string, manage: boolean) =>
    authorizer.require({
      actor,
      action: (manage ? ROLE_PERMISSIONS.rolesManage : ROLE_PERMISSIONS.rolesRead).id,
      resource: organization(organizationId),
    })

  /** Throws unless the actor holds every permission in `permissions` in `tenant`. */
  async function assertHolds(
    actor: Actor,
    tenant: Tenant,
    permissions: readonly string[],
    message: string,
  ): Promise<void> {
    const held = (await authorizer.permissionsIn(actor, tenant)) ?? new Set<PermissionId>()
    if (permissions.some((id) => !held.has(id as PermissionId))) throw new ForbiddenError(message)
  }
  const guard = (actor: Actor, organizationId: string, permissions: readonly string[]) =>
    assertHolds(
      actor,
      { organizationId },
      permissions,
      'You can only manage roles whose permissions you hold',
    )

  return {
    async list(actor, organizationId) {
      await requireRoles(actor, organizationId, false)
      return store.list(organizationId)
    },

    async get(actor, organizationId, roleId) {
      await requireRoles(actor, organizationId, false)
      return store.get(organizationId, roleId)
    },

    async create(actor, organizationId, input) {
      await requireRoles(actor, organizationId, true)
      await guard(actor, organizationId, input.permissions ?? [])
      return store.create(organizationId, input)
    },

    async update(actor, organizationId, roleId, input) {
      await requireRoles(actor, organizationId, true)
      const current = await store.get(organizationId, roleId)
      await guard(actor, organizationId, [...current.permissions, ...(input.permissions ?? [])])
      return store.update(organizationId, roleId, input)
    },

    async delete(actor, organizationId, roleId) {
      await requireRoles(actor, organizationId, true)
      const current = await store.get(organizationId, roleId)
      await guard(actor, organizationId, current.permissions)
      await store.delete(organizationId, roleId)
    },

    async assertCanGrant(actor, tenant, roleKey) {
      const level = tenant.spaceId === undefined ? 'organization' : 'space'
      const role = await store.find(tenant.organizationId, roleKey)
      if (role === undefined || !role.assignableTo.includes(level)) {
        const options = (await store.list(tenant.organizationId))
          .filter((r) => r.assignableTo.includes(level))
          .map((r) => (r.system ? r.id : `${r.id} (${r.name})`))
        throw new ValidationError('Unknown role', [
          { path: ['role'], message: `Use one of: ${options.join(', ')} (got ${roleKey})` },
        ])
      }
      // At space level only space-scoped permissions take effect (see Authorizer.permissionsIn).
      const effective = role.permissions.filter(
        (id) => level === 'organization' || catalog.get(id)?.scope === 'space',
      )
      await assertHolds(
        actor,
        tenant,
        effective,
        'You can only grant or revoke roles whose permissions you hold',
      )
    },
  }
}

import {
  ConflictError,
  createServiceToken,
  NotFoundError,
  type PermissionId,
  type ServiceToken,
  ValidationError,
  validate,
} from '@blixis/contracts'
import { type Database, isId } from '@blixis/database'
import type { MembershipService } from '@blixis/users'
import {
  type CreateRoleInput,
  createRoleSchema,
  isSystemRoleId,
  type Role,
  type UpdateRoleInput,
  updateRoleSchema,
} from '../domain/role.ts'
import { roleRepository } from '../infrastructure/role.repository.ts'
import type { PermissionCatalog } from './catalog.ts'

/**
 * Role data of an organization: the system roles (code) and its custom roles (Postgres). No
 * authorization — internal to `@blixis/permissions`; other modules use `ROLE_SERVICE`, which
 * checks permissions first. Request-scoped and memoised per organization.
 */
export interface RoleStore {
  /** System roles first (owner, admin, editor, viewer), then custom roles by name. */
  list(organizationId: string): Promise<readonly Role[]>
  /** @throws NotFoundError for unknown ids and other organizations' roles */
  get(organizationId: string, roleId: string): Promise<Role>
  /** A role by id, or `undefined`. */
  find(organizationId: string, roleId: string): Promise<Role | undefined>
  /** @throws ValidationError (invalid input, unknown permissions), ConflictError (name taken) */
  create(organizationId: string, input: CreateRoleInput): Promise<Role>
  /** @throws NotFoundError, ValidationError, ConflictError (system role, name taken) */
  update(organizationId: string, roleId: string, input: UpdateRoleInput): Promise<Role>
  /** @throws NotFoundError, ConflictError (system role, or still assigned to members) */
  delete(organizationId: string, roleId: string): Promise<void>
  /**
   * Permissions a membership with `roleKey` grants in the organization. Unknown or deleted roles
   * grant nothing; permissions no installed module declares are ignored.
   */
  permissionsOf(organizationId: string, roleKey: string): Promise<ReadonlySet<PermissionId>>
}

/** Request-scoped {@link RoleStore} (internal to `@blixis/permissions`). */
export const ROLE_STORE: ServiceToken<RoleStore> = createServiceToken<RoleStore>(
  '@blixis/permissions.role-store',
)

/** Creates the {@link RoleStore} of one request scope. */
export function createRoleStore(deps: {
  readonly db: Database
  readonly catalog: PermissionCatalog
  readonly systemRoles: readonly Role[]
  readonly memberships: MembershipService
}): RoleStore {
  const { db, catalog, systemRoles, memberships } = deps
  const custom = new Map<string, Promise<Role[]>>()
  const customRoles = (organizationId: string) => {
    let roles = custom.get(organizationId)
    if (roles === undefined) {
      roles = roleRepository.listInOrganization(db, organizationId)
      custom.set(organizationId, roles)
    }
    return roles
  }
  const forget = (organizationId: string) => custom.delete(organizationId)

  const known = (ids: readonly string[]): PermissionId[] => {
    const unknown = ids.filter((id) => catalog.get(id) === undefined)
    if (unknown.length > 0) {
      throw new ValidationError('Unknown permissions', [
        { path: ['permissions'], message: `No module declares: ${unknown.join(', ')}` },
      ])
    }
    return ids as PermissionId[]
  }
  const assertNameFree = (name: string) => {
    if (systemRoles.some((role) => role.name.toLowerCase() === name.toLowerCase()))
      throw new ConflictError(`"${name}" is the name of a system role`)
  }
  const assertCustom = (roleId: string) => {
    if (isSystemRoleId(roleId))
      throw new ConflictError('System roles are defined in code and cannot be changed')
  }
  const translateNameConflict = (error: unknown): never => {
    if (error instanceof ConflictError)
      throw new ConflictError('A role with this name already exists')
    throw error
  }

  const service: RoleStore = {
    async list(organizationId) {
      return [...systemRoles, ...(await customRoles(organizationId))]
    },

    async find(organizationId, roleId) {
      const system = systemRoles.find((role) => role.id === roleId)
      if (system !== undefined) return system
      if (!isId(roleId)) return undefined
      return (await customRoles(organizationId)).find((role) => role.id === roleId)
    },

    async get(organizationId, roleId) {
      const role = await service.find(organizationId, roleId)
      if (role === undefined) throw new NotFoundError('Role not found')
      return role
    },

    async create(organizationId, input) {
      const values = await validate(createRoleSchema, input, { message: 'Invalid role' })
      assertNameFree(values.name)
      const role = await roleRepository
        .insert(db, { organizationId, ...values, permissions: known(values.permissions) })
        .catch(translateNameConflict)
      forget(organizationId)
      return role
    },

    async update(organizationId, roleId, input) {
      assertCustom(roleId)
      const values = await validate(updateRoleSchema, input, { message: 'Invalid role' })
      if (values.name !== undefined) assertNameFree(values.name)
      if (!isId(roleId)) throw new NotFoundError('Role not found')
      const updated = await roleRepository
        .update(db, organizationId, roleId, {
          ...(values.name === undefined ? {} : { name: values.name }),
          ...(values.description === undefined ? {} : { description: values.description }),
          ...(values.permissions === undefined ? {} : { permissions: known(values.permissions) }),
        })
        .catch(translateNameConflict)
      if (updated === undefined) throw new NotFoundError('Role not found')
      forget(organizationId)
      return updated
    },

    async delete(organizationId, roleId) {
      assertCustom(roleId)
      if (!isId(roleId) || (await service.find(organizationId, roleId)) === undefined)
        throw new NotFoundError('Role not found')
      const assigned = await memberships.countWithRole(organizationId, roleId)
      if (assigned > 0) {
        throw new ConflictError(
          `The role is assigned to ${assigned} membership(s); change their roles first`,
        )
      }
      await roleRepository.delete(db, organizationId, roleId)
      forget(organizationId)
    },

    async permissionsOf(organizationId, roleKey) {
      const role = await service.find(organizationId, roleKey)
      return new Set(role?.permissions.filter((id) => catalog.get(id) !== undefined) ?? [])
    },
  }
  return service
}

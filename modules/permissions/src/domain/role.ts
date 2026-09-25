import {
  isSystemRoleKey,
  type PermissionId,
  SYSTEM_ROLES,
  type SystemRoleKey,
} from '@blixis/contracts'
import { z } from 'zod'
import type { CatalogPermission } from '../application/catalog.ts'

/** Where a role can be assigned: to organization memberships, space memberships, or both. */
export type RoleLevel = 'organization' | 'space'

/**
 * A role groups permissions (§30). System roles are defined in code (`id` is the key, e.g.
 * `admin`); custom roles belong to one organization (`id` is a UUID). Memberships store the id.
 */
export interface Role {
  readonly id: string
  /** `null` for system roles. */
  readonly organizationId: string | null
  readonly name: string
  readonly description: string
  readonly permissions: readonly PermissionId[]
  readonly system: boolean
  readonly assignableTo: readonly RoleLevel[]
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

const SYSTEM_ROLE_TEXT: Record<SystemRoleKey, { name: string; description: string }> = {
  owner: {
    name: 'Owner',
    description: 'Every permission, including granting and revoking the owner role',
  },
  admin: {
    name: 'Admin',
    description: 'Manages settings, members, and roles',
  },
  editor: { name: 'Editor', description: 'Works with content; cannot change settings' },
  viewer: { name: 'Viewer', description: 'Read-only access' },
}

/**
 * The system roles for a permission catalog: `owner` holds every permission; the others hold the
 * permissions whose `defaultRoles` list them. `owner` is assignable at organization level only.
 */
export function systemRoles(catalog: readonly CatalogPermission[]): readonly Role[] {
  return SYSTEM_ROLES.map((key) =>
    Object.freeze({
      id: key,
      organizationId: null,
      ...SYSTEM_ROLE_TEXT[key],
      permissions: Object.freeze(
        catalog.filter((p) => key === 'owner' || p.defaultRoles.includes(key)).map((p) => p.id),
      ),
      system: true,
      assignableTo: Object.freeze<RoleLevel[]>(
        key === 'owner' ? ['organization'] : ['organization', 'space'],
      ),
      createdAt: null,
      updatedAt: null,
    }),
  )
}

/** Whether a role id names a system role (otherwise it is a custom role id). */
export const isSystemRoleId = isSystemRoleKey

const roleName = z.string().trim().min(1).max(100)
const permissionList = z
  .array(z.string())
  .max(500)
  .transform((ids) => [...new Set(ids)])

export const createRoleSchema = z.object({
  name: roleName,
  description: z.string().trim().max(500).default(''),
  permissions: permissionList,
})
export const updateRoleSchema = z.object({
  name: roleName.optional(),
  description: z.string().trim().max(500).optional(),
  permissions: permissionList.optional(),
})
export type CreateRoleInput = z.input<typeof createRoleSchema>
export type UpdateRoleInput = z.input<typeof updateRoleSchema>

import { SYSTEM_ROLES, type SystemRoleKey } from '@blixis/contracts'

/**
 * System roles assignable per level (`role_key`). Roles are defined and evaluated by
 * `@blixis/permissions`; `role_key` may also hold a custom role id (plan 009).
 */
export const ORGANIZATION_ROLES = SYSTEM_ROLES
export const SPACE_ROLES = ['admin', 'editor', 'viewer'] as const satisfies readonly SystemRoleKey[]
export type OrganizationRole = SystemRoleKey
export type SpaceRole = (typeof SPACE_ROLES)[number]

/** A user's membership of an organization (`spaceId: null`) or a space. */
export interface Membership {
  readonly id: string
  readonly userId: string
  readonly organizationId: string
  readonly spaceId: string | null
  readonly role: string
  readonly createdAt: string
  readonly updatedAt: string
}

/** Where a membership applies: an organization, or a space inside it. */
export interface MembershipScope {
  readonly organizationId: string
  readonly spaceId?: string
}

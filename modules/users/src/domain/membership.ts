import { z } from 'zod'

/** Roles until plan 009 introduces permission-based roles; stored as `role_key`. */
export const ORGANIZATION_ROLES = ['owner', 'admin', 'member'] as const
export const SPACE_ROLES = ['admin', 'editor', 'viewer'] as const
export type OrganizationRole = (typeof ORGANIZATION_ROLES)[number]
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

/** A user's access to a space: via the organization, the space itself, or both. */
export interface SpaceAccess {
  readonly organizationRole: OrganizationRole | null
  readonly spaceRole: SpaceRole | null
}

export const organizationRoleSchema = z.enum(ORGANIZATION_ROLES)
export const spaceRoleSchema = z.enum(SPACE_ROLES)

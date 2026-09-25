import { definePermission } from '@blixis/contracts'

/**
 * Permissions of the tenant hierarchy (architecture §30). Organization-scoped permissions are
 * granted by organization memberships only; space-scoped ones by organization and space
 * memberships. `defaultRoles` grant them to system roles; `owner` holds all of them.
 */
export const SPACES_PERMISSIONS = {
  organizationRead: definePermission({
    id: 'organizations.read',
    description: 'View the organization, its spaces, and its members',
    scope: 'organization',
    defaultRoles: ['admin', 'editor', 'viewer'],
  }),
  organizationSettingsWrite: definePermission({
    id: 'organizations.settings.write',
    description: 'Rename the organization and change its slug',
    scope: 'organization',
    defaultRoles: ['admin'],
  }),
  organizationMembersManage: definePermission({
    id: 'organizations.members.manage',
    description: 'Add organization members, change their roles, and remove them',
    scope: 'organization',
    defaultRoles: ['admin'],
  }),
  /** Owner-only: holding it is required to grant or revoke the `owner` role (escalation guard). */
  organizationOwnersManage: definePermission({
    id: 'organizations.owners.manage',
    description: 'Grant and revoke the owner role',
    scope: 'organization',
  }),
  spaceCreate: definePermission({
    id: 'spaces.create',
    description: 'Create spaces in the organization',
    scope: 'organization',
    defaultRoles: ['admin'],
  }),
  spaceRead: definePermission({
    id: 'spaces.read',
    description: 'View the space, its environments, locales, and members',
    defaultRoles: ['admin', 'editor', 'viewer'],
  }),
  spaceSettingsWrite: definePermission({
    id: 'spaces.settings.write',
    description: 'Rename the space and manage its locales',
    defaultRoles: ['admin'],
  }),
  spaceDelete: definePermission({
    id: 'spaces.delete',
    description: 'Delete the space and all its data',
    defaultRoles: ['admin'],
  }),
  spaceMembersManage: definePermission({
    id: 'spaces.members.manage',
    description: 'Add space members, change their roles, and remove them',
    defaultRoles: ['admin'],
  }),
} as const

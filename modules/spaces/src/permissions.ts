import { definePermission } from '@blixis/contracts'

/**
 * Permissions of the tenant hierarchy (architecture §30). Organization-scoped permissions are
 * granted by organization memberships only; space-scoped ones by organization and space
 * memberships.
 */
export const SPACES_PERMISSIONS = {
  organizationRead: definePermission({
    id: 'organizations.read',
    description: 'View the organization, its spaces, and its members',
    scope: 'organization',
  }),
  organizationSettingsWrite: definePermission({
    id: 'organizations.settings.write',
    description: 'Rename the organization and change its slug',
    scope: 'organization',
  }),
  organizationMembersManage: definePermission({
    id: 'organizations.members.manage',
    description: 'Add organization members, change their roles, and remove them',
    scope: 'organization',
  }),
  spaceCreate: definePermission({
    id: 'spaces.create',
    description: 'Create spaces in the organization',
    scope: 'organization',
  }),
  spaceRead: definePermission({
    id: 'spaces.read',
    description: 'View the space, its environments, locales, and members',
  }),
  spaceSettingsWrite: definePermission({
    id: 'spaces.settings.write',
    description: 'Rename the space and manage its locales',
  }),
  spaceDelete: definePermission({
    id: 'spaces.delete',
    description: 'Delete the space and all its data',
  }),
  spaceMembersManage: definePermission({
    id: 'spaces.members.manage',
    description: 'Add space members, change their roles, and remove them',
  }),
} as const

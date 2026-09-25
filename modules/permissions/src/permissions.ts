import { definePermission } from '@blixis/contracts'

/** Permissions of the permissions module itself (role management). */
export const ROLE_PERMISSIONS = {
  rolesRead: definePermission({
    id: 'roles.read',
    description: "View the organization's roles and their permissions",
    scope: 'organization',
    defaultRoles: ['admin', 'editor', 'viewer'],
  }),
  rolesManage: definePermission({
    id: 'roles.manage',
    description: 'Create, change, and delete custom roles',
    scope: 'organization',
    defaultRoles: ['admin'],
  }),
} as const

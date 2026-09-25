import { definePermission } from '@blixis/contracts'

/** Permissions of the auth module. Personal API tokens need none: they belong to their owner. */
export const AUTH_PERMISSIONS = {
  deliveryKeysManage: definePermission({
    id: 'auth.deliveryKeys.manage',
    description: 'Create, list, and revoke delivery and preview keys of a space',
    defaultRoles: ['admin'],
  }),
} as const

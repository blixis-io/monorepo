import { definePermission } from '@blixis-io/contracts'

/** Permissions of the webhooks module. Webhooks send data out of Blixis: admins by default. */
export const WEBHOOK_PERMISSIONS = {
  read: definePermission({
    id: 'webhooks.read',
    description: 'View webhooks and their delivery logs',
    defaultRoles: ['admin'],
  }),
  manage: definePermission({
    id: 'webhooks.manage',
    description: 'Create, change, test, and delete webhooks, rotate their secrets, and redeliver',
    defaultRoles: ['admin'],
  }),
} as const

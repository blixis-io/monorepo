import { definePermission } from '@blixis/contracts'

/** Permissions granted per space; code checks them, never role names (§30). */
export const SEO_PERMISSIONS = {
  read: definePermission({
    id: 'seo.read',
    description: 'Read SEO metadata of entries',
    defaultRoles: ['admin', 'editor', 'viewer'],
  }),
  write: definePermission({
    id: 'seo.write',
    description: 'Change SEO metadata of entries',
    defaultRoles: ['admin', 'editor'],
  }),
} as const

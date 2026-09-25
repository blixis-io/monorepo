import { definePermission } from '@blixis/contracts'

/** Permissions of the content module (entry permissions follow in plan 011). */
export const CONTENT_PERMISSIONS = {
  typesRead: definePermission({
    id: 'content.types.read',
    description: 'View content types, components, and field types',
    defaultRoles: ['admin', 'editor', 'viewer'],
  }),
  typesWrite: definePermission({
    id: 'content.types.write',
    description: 'Create, change, and delete content types and components',
    defaultRoles: ['admin'],
  }),
} as const

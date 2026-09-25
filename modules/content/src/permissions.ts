import { definePermission } from '@blixis/contracts'

/** Permissions of the content module. */
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
  entriesRead: definePermission({
    id: 'content.entries.read',
    description: 'View entries, including drafts and version history',
    defaultRoles: ['admin', 'editor', 'viewer'],
  }),
  entriesWrite: definePermission({
    id: 'content.entries.write',
    description: 'Create entries, save new versions, and restore old versions',
    defaultRoles: ['admin', 'editor'],
  }),
  entriesPublish: definePermission({
    id: 'content.entries.publish',
    description: 'Publish and unpublish entries',
    defaultRoles: ['admin', 'editor'],
  }),
  entriesDelete: definePermission({
    id: 'content.entries.delete',
    description: 'Delete unpublished entries with all their versions',
    defaultRoles: ['admin', 'editor'],
  }),
} as const

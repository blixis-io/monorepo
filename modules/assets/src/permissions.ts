import { definePermission } from '@blixis/contracts'

/** Permissions of the assets module. */
export const ASSET_PERMISSIONS = {
  read: definePermission({
    id: 'assets.read',
    description: 'View assets and their metadata, including unpublished ones',
    defaultRoles: ['admin', 'editor', 'viewer'],
  }),
  write: definePermission({
    id: 'assets.write',
    description: 'Upload assets, replace their files, and edit their metadata',
    defaultRoles: ['admin', 'editor'],
  }),
  publish: definePermission({
    id: 'assets.publish',
    description: 'Publish and unpublish assets',
    defaultRoles: ['admin', 'editor'],
  }),
  delete: definePermission({
    id: 'assets.delete',
    description: 'Delete unpublished assets and their files',
    defaultRoles: ['admin', 'editor'],
  }),
} as const

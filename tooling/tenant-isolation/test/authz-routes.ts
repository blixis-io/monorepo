import { defineAuthzMatrix } from '@blixis/testing'

/**
 * Every permission-guarded route of the API with the permission its service checks (roadmap
 * 009.005). Each matrix case runs these in order against its own fresh tenant: reads first,
 * then changes, deleting shared fixtures (the space) last. Bodies must succeed for an allowed
 * actor. New modules add their routes here; the suite fails for tenant routes missing from it.
 */
export const AUTHZ_ROUTES = defineAuthzMatrix([
  // Reads
  {
    method: 'GET',
    path: '/api/v1/organizations/:orgId',
    permission: 'organizations.read',
    level: 'organization',
  },
  {
    method: 'GET',
    path: '/api/v1/organizations/:orgId/spaces',
    permission: 'organizations.read',
    level: 'organization',
  },
  {
    method: 'GET',
    path: '/api/v1/organizations/:orgId/members',
    permission: 'organizations.read',
    level: 'organization',
  },
  {
    method: 'GET',
    path: '/api/v1/organizations/:orgId/roles',
    permission: 'roles.read',
    level: 'organization',
  },
  { method: 'GET', path: '/api/v1/spaces/:spaceId', permission: 'spaces.read', level: 'space' },
  {
    method: 'GET',
    path: '/api/v1/spaces/:spaceId/environments',
    permission: 'spaces.read',
    level: 'space',
  },
  {
    method: 'GET',
    path: '/api/v1/spaces/:spaceId/locales',
    permission: 'spaces.read',
    level: 'space',
  },
  {
    method: 'GET',
    path: '/api/v1/spaces/:spaceId/members',
    permission: 'spaces.read',
    level: 'space',
  },
  // Organization changes
  {
    method: 'PATCH',
    path: '/api/v1/organizations/:orgId',
    body: { name: 'Renamed' },
    permission: 'organizations.settings.write',
    level: 'organization',
  },
  {
    method: 'POST',
    path: '/api/v1/organizations/:orgId/spaces',
    body: { name: 'Matrix', slug: 'matrix' },
    permission: 'spaces.create',
    level: 'organization',
  },
  {
    method: 'POST',
    path: '/api/v1/organizations/:orgId/members',
    body: { email: 'newcomer@example.com', role: 'viewer' },
    permission: 'organizations.members.manage',
    level: 'organization',
  },
  {
    method: 'PATCH',
    path: '/api/v1/organizations/:orgId/members/:membershipId',
    body: { role: 'editor' },
    paramsFrom: { membershipId: 'orgMembershipId' },
    permission: 'organizations.members.manage',
    level: 'organization',
  },
  {
    method: 'DELETE',
    path: '/api/v1/organizations/:orgId/members/:membershipId',
    paramsFrom: { membershipId: 'orgMembershipId' },
    permission: 'organizations.members.manage',
    level: 'organization',
  },
  {
    method: 'POST',
    path: '/api/v1/organizations/:orgId/roles',
    body: { name: 'Matrix', permissions: ['spaces.read'] },
    permission: 'roles.manage',
    level: 'organization',
  },
  {
    method: 'PATCH',
    path: '/api/v1/organizations/:orgId/roles/:roleId',
    body: { description: 'Changed' },
    permission: 'roles.manage',
    level: 'organization',
  },
  {
    method: 'DELETE',
    path: '/api/v1/organizations/:orgId/roles/:roleId',
    permission: 'roles.manage',
    level: 'organization',
  },
  // Space changes
  {
    method: 'PATCH',
    path: '/api/v1/spaces/:spaceId',
    body: { name: 'Renamed' },
    permission: 'spaces.settings.write',
    level: 'space',
  },
  {
    method: 'POST',
    path: '/api/v1/spaces/:spaceId/locales',
    body: { code: 'fr' },
    permission: 'spaces.settings.write',
    level: 'space',
  },
  {
    method: 'PATCH',
    path: '/api/v1/spaces/:spaceId/locales/:localeId',
    body: { name: 'Deutsch' },
    permission: 'spaces.settings.write',
    level: 'space',
  },
  {
    method: 'DELETE',
    path: '/api/v1/spaces/:spaceId/locales/:localeId',
    permission: 'spaces.settings.write',
    level: 'space',
  },
  {
    method: 'POST',
    path: '/api/v1/spaces/:spaceId/members',
    body: { email: 'newcomer@example.com', role: 'viewer' },
    permission: 'spaces.members.manage',
    level: 'space',
  },
  {
    method: 'PATCH',
    path: '/api/v1/spaces/:spaceId/members/:membershipId',
    body: { role: 'viewer' },
    paramsFrom: { membershipId: 'spaceMembershipId' },
    permission: 'spaces.members.manage',
    level: 'space',
  },
  {
    method: 'DELETE',
    path: '/api/v1/spaces/:spaceId/members/:membershipId',
    paramsFrom: { membershipId: 'spaceMembershipId' },
    permission: 'spaces.members.manage',
    level: 'space',
  },
  // Content types
  {
    method: 'GET',
    path: '/api/v1/spaces/:spaceId/content-types',
    permission: 'content.types.read',
    level: 'space',
  },
  {
    method: 'GET',
    path: '/api/v1/spaces/:spaceId/content-types/:contentTypeId',
    permission: 'content.types.read',
    level: 'space',
  },
  {
    method: 'POST',
    path: '/api/v1/spaces/:spaceId/content-types',
    body: { apiId: 'matrix', name: 'Matrix' },
    permission: 'content.types.write',
    level: 'space',
  },
  {
    method: 'PATCH',
    path: '/api/v1/spaces/:spaceId/content-types/:contentTypeId',
    body: { version: 1, name: 'Renamed' },
    permission: 'content.types.write',
    level: 'space',
  },
  // Entries
  {
    method: 'GET',
    path: '/api/v1/spaces/:spaceId/entries',
    permission: 'content.entries.read',
    level: 'space',
  },
  {
    method: 'GET',
    path: '/api/v1/entries/:entryId',
    permission: 'content.entries.read',
    level: 'space',
  },
  {
    method: 'GET',
    path: '/api/v1/entries/:entryId/versions',
    permission: 'content.entries.read',
    level: 'space',
  },
  {
    method: 'GET',
    path: '/api/v1/entries/:entryId/versions/:versionId',
    permission: 'content.entries.read',
    level: 'space',
  },
  {
    method: 'POST',
    path: '/api/v1/spaces/:spaceId/entries',
    body: { contentType: 'article', fields: {} },
    permission: 'content.entries.write',
    level: 'space',
  },
  {
    method: 'PATCH',
    path: '/api/v1/entries/:entryId',
    body: { expectedVersion: 1, fields: {} },
    permission: 'content.entries.write',
    level: 'space',
  },
  {
    // After the PATCH row above, an allowed actor's entry is at version 2.
    method: 'POST',
    path: '/api/v1/entries/:entryId/versions/:versionId/restore',
    body: { expectedVersion: 2 },
    permission: 'content.entries.write',
    level: 'space',
  },
  {
    method: 'POST',
    path: '/api/v1/entries/:entryId/publish',
    permission: 'content.entries.publish',
    level: 'space',
  },
  {
    method: 'POST',
    path: '/api/v1/entries/:entryId/unpublish',
    permission: 'content.entries.publish',
    level: 'space',
  },
  {
    method: 'DELETE',
    path: '/api/v1/entries/:entryId',
    permission: 'content.entries.delete',
    level: 'space',
  },
  {
    method: 'DELETE',
    path: '/api/v1/spaces/:spaceId/content-types/:contentTypeId',
    permission: 'content.types.write',
    level: 'space',
  },
  // Last: deletes the case's space.
  {
    method: 'DELETE',
    path: '/api/v1/spaces/:spaceId',
    permission: 'spaces.delete',
    level: 'space',
  },
])

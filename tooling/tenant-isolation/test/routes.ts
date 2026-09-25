import type { IsolationRoute } from '@blixis/testing'

/**
 * Every tenant-scoped route of the API with a request that would change or reveal data if
 * isolation failed. New modules add their `/organizations/:orgId/…` and `/spaces/:spaceId/…`
 * routes here — the suite fails for tenant-scoped routes missing from this list.
 */
export const ISOLATION_ROUTES: readonly IsolationRoute[] = [
  // @blixis/spaces — organizations
  { method: 'GET', path: '/api/v1/organizations/:orgId' },
  { method: 'PATCH', path: '/api/v1/organizations/:orgId', body: { name: 'Hijacked' } },
  { method: 'GET', path: '/api/v1/organizations/:orgId/spaces' },
  {
    method: 'POST',
    path: '/api/v1/organizations/:orgId/spaces',
    body: { name: 'Planted', slug: 'planted' },
  },
  { method: 'GET', path: '/api/v1/organizations/:orgId/members' },
  {
    method: 'POST',
    path: '/api/v1/organizations/:orgId/members',
    body: { email: 'intruder@example.com', role: 'owner' },
  },
  {
    method: 'PATCH',
    path: '/api/v1/organizations/:orgId/members/:membershipId',
    body: { role: 'viewer' },
    paramsFrom: { membershipId: 'orgMembershipId' },
  },
  {
    method: 'DELETE',
    path: '/api/v1/organizations/:orgId/members/:membershipId',
    paramsFrom: { membershipId: 'orgMembershipId' },
  },
  // @blixis/spaces — spaces
  { method: 'GET', path: '/api/v1/spaces/:spaceId' },
  { method: 'PATCH', path: '/api/v1/spaces/:spaceId', body: { name: 'Hijacked' } },
  { method: 'DELETE', path: '/api/v1/spaces/:spaceId' },
  { method: 'GET', path: '/api/v1/spaces/:spaceId/environments' },
  { method: 'GET', path: '/api/v1/spaces/:spaceId/locales' },
  { method: 'POST', path: '/api/v1/spaces/:spaceId/locales', body: { code: 'fr' } },
  {
    method: 'PATCH',
    path: '/api/v1/spaces/:spaceId/locales/:localeId',
    body: { name: 'Hijacked' },
  },
  { method: 'DELETE', path: '/api/v1/spaces/:spaceId/locales/:localeId' },
  { method: 'GET', path: '/api/v1/spaces/:spaceId/members' },
  {
    method: 'POST',
    path: '/api/v1/spaces/:spaceId/members',
    body: { email: 'intruder@example.com', role: 'admin' },
  },
  {
    method: 'PATCH',
    path: '/api/v1/spaces/:spaceId/members/:membershipId',
    body: { role: 'viewer' },
    paramsFrom: { membershipId: 'spaceMembershipId' },
  },
  {
    method: 'DELETE',
    path: '/api/v1/spaces/:spaceId/members/:membershipId',
    paramsFrom: { membershipId: 'spaceMembershipId' },
  },
]

/** Tenant-scoped routes deliberately not probed, with the reason. Keep empty when possible. */
export const ISOLATION_ALLOW_LIST: readonly string[] = []

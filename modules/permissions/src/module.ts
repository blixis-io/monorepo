import { BLIXIS_CAPABILITIES } from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule, KERNEL_CONTRIBUTIONS } from '@blixis/kernel'
import { MEMBERSHIP_SERVICE } from '@blixis/users'
import { createPermissionCatalog, PERMISSION_CATALOG } from './application/catalog.ts'
import { createRoleService, ROLE_SERVICE } from './application/role.service.ts'
import { systemRoles } from './domain/role.ts'
import { createRoles } from './infrastructure/migrations/0001_create_roles.ts'
import { ROLE_PERMISSIONS } from './permissions.ts'
import { permissionsRoutes } from './rest/routes.ts'

/**
 * Authorization (architecture §30, plan 009): the catalog of permissions declared by modules
 * (`GET /api/v1/permissions`), system roles derived from `defaultRoles`, and custom roles per
 * organization.
 */
export const permissionsModule = defineModule({
  meta: {
    name: '@blixis/permissions',
    version: '0.0.0',
    capabilities: [BLIXIS_CAPABILITIES.permissions],
    requires: { '@blixis/users': '>=0.0.0' },
    requiresCapabilities: [BLIXIS_CAPABILITIES.database],
  },
  permissions: Object.values(ROLE_PERMISSIONS),
  migrations: [createRoles],
  setup(ctx) {
    const catalog = createPermissionCatalog(ctx.services.get(KERNEL_CONTRIBUTIONS).permissions)
    const roles = systemRoles(catalog.list())
    ctx.services.provide(PERMISSION_CATALOG, catalog)
    ctx.services.provideFactory(
      ROLE_SERVICE,
      ({ services }) =>
        createRoleService({
          db: services.get(DATABASE),
          catalog,
          systemRoles: roles,
          memberships: services.get(MEMBERSHIP_SERVICE),
        }),
      { scope: 'request' },
    )
  },
  rest: { path: '/permissions', app: permissionsRoutes },
})

import { BLIXIS_CAPABILITIES } from '@blixis/contracts'
import { defineModule, KERNEL_CONTRIBUTIONS } from '@blixis/kernel'
import { createPermissionCatalog, PERMISSION_CATALOG } from './application/catalog.ts'
import { ROLE_PERMISSIONS } from './permissions.ts'
import { permissionsRoutes } from './rest/routes.ts'

/**
 * Authorization (architecture §30, plan 009): the catalog of permissions declared by modules,
 * served at `GET /api/v1/permissions`.
 */
export const permissionsModule = defineModule({
  meta: {
    name: '@blixis/permissions',
    version: '0.0.0',
    capabilities: [BLIXIS_CAPABILITIES.permissions],
  },
  permissions: Object.values(ROLE_PERMISSIONS),
  setup(ctx) {
    ctx.services.provide(
      PERMISSION_CATALOG,
      createPermissionCatalog(ctx.services.get(KERNEL_CONTRIBUTIONS).permissions),
    )
  },
  rest: { path: '/permissions', app: permissionsRoutes },
})

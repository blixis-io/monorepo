import { AUTHORIZATION_SERVICE, BLIXIS_CAPABILITIES, REQUEST_CONTEXT } from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule, KERNEL_CONTRIBUTIONS } from '@blixis/kernel'
import { MEMBERSHIP_SERVICE } from '@blixis/users'
import { AUTHORIZER, createAuthorizer } from './application/authorization.service.ts'
import { createPermissionCatalog, PERMISSION_CATALOG } from './application/catalog.ts'
import { createRoleService, ROLE_SERVICE } from './application/role.service.ts'
import { createRoleStore, ROLE_STORE } from './application/role.store.ts'
import { systemRoles } from './domain/role.ts'
import { createRoles } from './infrastructure/migrations/0001_create_roles.ts'
import { ROLE_PERMISSIONS } from './permissions.ts'
import { permissionsRoutes } from './rest/routes.ts'

/**
 * Authorization (architecture §30, plan 009): the catalog of permissions declared by modules,
 * system roles derived from `defaultRoles`, custom roles per organization, and
 * `AUTHORIZATION_SERVICE`.
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
      ROLE_STORE,
      ({ services }) =>
        createRoleStore({
          db: services.get(DATABASE),
          catalog,
          systemRoles: roles,
          memberships: services.get(MEMBERSHIP_SERVICE),
        }),
      { scope: 'request' },
    )
    ctx.services.provideFactory(
      AUTHORIZER,
      ({ services }) => {
        // Read lazily: spaceScoped() rebinds the request context after services are created.
        const context = () => services.get(REQUEST_CONTEXT)
        return createAuthorizer({
          catalog,
          roles: services.get(ROLE_STORE),
          memberships: services.get(MEMBERSHIP_SERVICE),
          logger: () => context().logger,
          boundTenant: () => context().tenant,
        })
      },
      { scope: 'request' },
    )
    ctx.services.provideFactory(AUTHORIZATION_SERVICE, ({ services }) => services.get(AUTHORIZER), {
      scope: 'request',
    })
    ctx.services.provideFactory(
      ROLE_SERVICE,
      ({ services }) =>
        createRoleService({
          store: services.get(ROLE_STORE),
          authorizer: services.get(AUTHORIZER),
          catalog,
        }),
      { scope: 'request' },
    )
  },
  rest: { path: '/', app: permissionsRoutes },
})

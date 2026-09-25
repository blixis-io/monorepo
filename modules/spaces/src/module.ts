import { AUTHORIZATION_SERVICE, BLIXIS_CAPABILITIES, EVENT_BUS } from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { ROLE_SERVICE } from '@blixis/permissions'
import { MEMBERSHIP_SERVICE, USER_SERVICE } from '@blixis/users'
import {
  createEnvironmentService,
  createLocaleService,
  ENVIRONMENT_SERVICE,
  LOCALE_SERVICE,
} from './application/locales.service.ts'
import { createMemberService, MEMBER_SERVICE } from './application/members.service.ts'
import { createTenancyService, TENANCY_SERVICE } from './application/tenancy.service.ts'
import { createTenantResolver, TENANT_RESOLVER } from './application/tenant-resolver.ts'
import { createSpaces } from './infrastructure/migrations/0001_create_spaces.ts'
import { SPACES_PERMISSIONS } from './permissions.ts'
import { spacesRoutes } from './rest/routes.ts'

/** Options for {@link spacesModule}. */
export interface SpacesModuleOptions {
  /** Let any signed-in user create organizations. Default `true` (plan 008 default). */
  readonly allowOrganizationCreation?: boolean
}

/**
 * The tenant hierarchy (architecture §21, plan 008): organizations → spaces → environments and
 * locales, with member management. Memberships are stored by `@blixis/users`.
 */
export const spacesModule = defineModule((options: SpacesModuleOptions) => ({
  meta: {
    name: '@blixis/spaces',
    version: '0.0.0',
    capabilities: [BLIXIS_CAPABILITIES.spaces],
    requires: { '@blixis/users': '>=0.0.0', '@blixis/permissions': '>=0.0.0' },
    requiresCapabilities: [BLIXIS_CAPABILITIES.database, BLIXIS_CAPABILITIES.events],
  },
  permissions: Object.values(SPACES_PERMISSIONS),
  migrations: [createSpaces],
  setup(ctx) {
    ctx.services.provideFactory(
      TENANCY_SERVICE,
      ({ services }) =>
        createTenancyService({
          db: services.get(DATABASE),
          memberships: services.get(MEMBERSHIP_SERVICE),
          events: services.get(EVENT_BUS),
          authz: services.get(AUTHORIZATION_SERVICE),
        }),
      { scope: 'request' },
    )
    ctx.services.provideFactory(
      ENVIRONMENT_SERVICE,
      ({ services }) =>
        createEnvironmentService({
          db: services.get(DATABASE),
          authz: services.get(AUTHORIZATION_SERVICE),
        }),
      { scope: 'request' },
    )
    ctx.services.provideFactory(
      LOCALE_SERVICE,
      ({ services }) =>
        createLocaleService({
          db: services.get(DATABASE),
          events: services.get(EVENT_BUS),
          authz: services.get(AUTHORIZATION_SERVICE),
        }),
      { scope: 'request' },
    )
    ctx.services.provideFactory(
      TENANT_RESOLVER,
      ({ services }) =>
        createTenantResolver({
          db: services.get(DATABASE),
          authz: services.get(AUTHORIZATION_SERVICE),
        }),
      { scope: 'request' },
    )
    ctx.services.provideFactory(
      MEMBER_SERVICE,
      ({ services }) =>
        createMemberService({
          db: services.get(DATABASE),
          authz: services.get(AUTHORIZATION_SERVICE),
          roles: services.get(ROLE_SERVICE),
          memberships: services.get(MEMBERSHIP_SERVICE),
          users: services.get(USER_SERVICE),
        }),
      { scope: 'request' },
    )
  },
  rest: {
    path: '/',
    app: spacesRoutes({ allowOrganizationCreation: options.allowOrganizationCreation ?? true }),
  },
}))

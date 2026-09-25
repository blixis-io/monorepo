import { BLIXIS_CAPABILITIES, EVENT_BUS } from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { createMembershipService, MEMBERSHIP_SERVICE } from './application/membership.service.ts'
import { createUserService, USER_SERVICE } from './application/user.service.ts'
import { createUsers } from './infrastructure/migrations/0001_create_users.ts'
import { createMemberships } from './infrastructure/migrations/0002_create_memberships.ts'
import { systemRoleKeys } from './infrastructure/migrations/0003_system_role_keys.ts'
import { usersRoutes } from './rest/routes.ts'

/**
 * The users module (roadmap 007.002): owns `users.users`, provides `USER_SERVICE` and the
 * `blixis.users` capability, and serves `GET/PATCH /api/v1/users/me`. No authentication logic —
 * `@blixis/auth` resolves actors and creates users through `USER_SERVICE`.
 */
export const usersModule = defineModule({
  meta: {
    name: '@blixis/users',
    version: '0.0.0',
    capabilities: [BLIXIS_CAPABILITIES.users],
    requiresCapabilities: [BLIXIS_CAPABILITIES.database, BLIXIS_CAPABILITIES.events],
  },
  migrations: [createUsers, createMemberships, systemRoleKeys],
  setup(ctx) {
    ctx.services.provideFactory(
      USER_SERVICE,
      ({ services }) =>
        createUserService({ db: services.get(DATABASE), events: services.get(EVENT_BUS) }),
      { scope: 'request' },
    )
    ctx.services.provideFactory(
      MEMBERSHIP_SERVICE,
      ({ services }) =>
        createMembershipService({ db: services.get(DATABASE), events: services.get(EVENT_BUS) }),
      { scope: 'request' },
    )
  },
  rest: { path: '/users', app: usersRoutes },
})

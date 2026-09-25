import { BLIXIS_CAPABILITIES, EVENT_BUS, REQUEST_CONTEXT } from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { BACKGROUND_HANDLERS, defineModule } from '@blixis/kernel'
import { USER_SERVICE } from '@blixis/users'
import {
  AUTH_SERVICE,
  type AuthPolicy,
  createAuthService,
  DEFAULT_AUTH_POLICY,
} from './application/auth.service.ts'
import { AUTH_CONFIG } from './application/config.ts'
import { createAuth } from './infrastructure/migrations/0001_create_auth.ts'
import { refreshTokenRepository } from './infrastructure/repositories.ts'
import { authRoutes } from './rest/routes.ts'

/** Options for {@link authModule}. */
export interface AuthModuleOptions extends Partial<AuthPolicy> {
  /** Allow public `POST /api/v1/auth/sign-up`. Default `false`: create users with `pnpm auth:create-user`. */
  readonly allowSignUp?: boolean
  /** Cron of the expired-token cleanup (must be in `wrangler.jsonc`). Default every minute. */
  readonly cron?: string
}

/**
 * Authentication (ADR 0009): credentials, JWT access tokens, rotating refresh tokens, and
 * `/api/v1/auth/*`. Needs `@blixis/users` (`USER_SERVICE`; its table is referenced by foreign
 * key, so it is a package requirement, not just a capability) and an `AUTH_CONFIG` provider.
 */
export const authModule = defineModule((options: AuthModuleOptions) => ({
  meta: {
    name: '@blixis/auth',
    version: '0.0.0',
    capabilities: [BLIXIS_CAPABILITIES.auth],
    requires: { '@blixis/users': '>=0.0.0' },
    requiresCapabilities: [BLIXIS_CAPABILITIES.database, BLIXIS_CAPABILITIES.events],
  },
  migrations: [createAuth],
  setup(ctx) {
    const policy: AuthPolicy = { ...DEFAULT_AUTH_POLICY, ...options }
    ctx.services.provideFactory(
      AUTH_SERVICE,
      ({ services }) => {
        const request = services.get(REQUEST_CONTEXT)
        return createAuthService({
          db: services.get(DATABASE),
          users: services.get(USER_SERVICE),
          events: services.get(EVENT_BUS),
          config: () => services.get(AUTH_CONFIG),
          policy,
          logger: request.logger,
          now: request.now,
        })
      },
      { scope: 'request' },
    )
    ctx.services
      .get(BACKGROUND_HANDLERS)
      .onScheduled(options.cron ?? '* * * * *', (_event, background) =>
        background
          .runInScope(
            { actor: { type: 'system', component: '@blixis/auth' } },
            async ({ services }) => {
              await refreshTokenRepository.deleteExpired(services.get(DATABASE), 7)
            },
          )
          .then(() => undefined),
      )
  },
  rest: { path: '/auth', app: authRoutes({ allowSignUp: options.allowSignUp ?? false }) },
}))

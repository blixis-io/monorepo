import {
  AUTHORIZATION_SERVICE,
  BLIXIS_CAPABILITIES,
  EVENT_BUS,
  type ModuleHonoEnv,
  REQUEST_CONTEXT,
  subscribe,
} from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import {
  ACTOR_RESOLVERS,
  BACKGROUND_HANDLERS,
  defineModule,
  KERNEL_CONTRIBUTIONS,
} from '@blixis/kernel'
import { spaceDeleted } from '@blixis/spaces'
import { USER_SERVICE, userDisabled } from '@blixis/users'
import { Hono } from 'hono'
import { API_TOKEN_SERVICE, createApiTokenService } from './application/api-tokens.ts'
import {
  AUTH_SERVICE,
  type AuthPolicy,
  createAuthService,
  DEFAULT_AUTH_POLICY,
} from './application/auth.service.ts'
import { AUTH_CONFIG } from './application/config.ts'
import { createDeliveryKeyService, DELIVERY_KEY_SERVICE } from './application/delivery-keys.ts'
import {
  apiTokenActorResolver,
  deliveryKeyActorResolver,
  jwtActorResolver,
} from './application/resolvers.ts'
import { createAuth } from './infrastructure/migrations/0001_create_auth.ts'
import { createApiTokens } from './infrastructure/migrations/0002_create_api_tokens.ts'
import { createThrottle } from './infrastructure/migrations/0003_create_throttle.ts'
import { createDeliveryKeys } from './infrastructure/migrations/0004_create_delivery_keys.ts'
import { refreshTokenRepository } from './infrastructure/repositories.ts'
import { AUTH_PERMISSIONS } from './permissions.ts'
import { deliveryKeyRoutes } from './rest/delivery-key.routes.ts'
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
    requires: { '@blixis/users': '>=0.0.0', '@blixis/spaces': '>=0.0.0' },
    requiresCapabilities: [BLIXIS_CAPABILITIES.database, BLIXIS_CAPABILITIES.events],
  },
  permissions: Object.values(AUTH_PERMISSIONS),
  migrations: [createAuth, createApiTokens, createThrottle, createDeliveryKeys],
  // Disabled users lose every credential immediately (refresh families and API tokens).
  events: [
    subscribe(userDisabled, 'revoke-credentials', async (envelope, context) => {
      await context.services.get(API_TOKEN_SERVICE).revokeAll(envelope.payload.userId)
      await context.services.get(AUTH_SERVICE).revokeAllSessions(envelope.payload.userId)
    }),
    // Keys belong to their space.
    subscribe(spaceDeleted, 'delete-space-delivery-keys', async ({ payload }, context) => {
      await context.services.get(DELIVERY_KEY_SERVICE).deleteAllForSpace(payload)
    }),
  ],
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
    const knownPermissions = new Set(
      ctx.services.get(KERNEL_CONTRIBUTIONS).permissions.map(({ value }) => value.id as string),
    )
    ctx.services.provideFactory(
      API_TOKEN_SERVICE,
      // No REQUEST_CONTEXT: this service also runs inside actor resolution.
      ({ services }) =>
        createApiTokenService({
          db: services.get(DATABASE),
          knownPermissions,
          now: () => new Date(),
        }),
      { scope: 'request' },
    )
    ctx.services.get(ACTOR_RESOLVERS).register(jwtActorResolver)
    ctx.services.get(ACTOR_RESOLVERS).register(apiTokenActorResolver)
    ctx.services.get(ACTOR_RESOLVERS).register(deliveryKeyActorResolver)
    ctx.services.provideFactory(
      DELIVERY_KEY_SERVICE,
      // No REQUEST_CONTEXT here: key authentication runs during actor resolution.
      ({ services }) =>
        createDeliveryKeyService({
          db: services.get(DATABASE),
          authz: () => services.get(AUTHORIZATION_SERVICE),
          now: () => new Date(),
        }),
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
              await services.get(AUTH_SERVICE).cleanupThrottle()
            },
          )
          .then(() => undefined),
      )
  },
  rest: {
    path: '/',
    app: new Hono<ModuleHonoEnv>()
      .route('/auth', authRoutes({ allowSignUp: options.allowSignUp ?? false }))
      .route('/', deliveryKeyRoutes),
  },
}))

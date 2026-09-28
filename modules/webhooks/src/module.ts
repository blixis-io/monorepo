import {
  AUTHORIZATION_SERVICE,
  BLIXIS_CAPABILITIES,
  EVENT_BUS,
  type EventDefinition,
  type Logger,
  type ModuleHonoEnv,
  type ServiceRegistry,
  subscribe,
} from '@blixis-io/contracts'
import { DATABASE } from '@blixis-io/database'
import { BACKGROUND_HANDLERS, defineModule } from '@blixis-io/kernel'
import { ENVIRONMENT_SERVICE, spaceDeleted } from '@blixis-io/spaces'
import { Hono } from 'hono'
import { attemptDelivery, sweepDueDeliveries } from './application/deliver.ts'
import { fanOut } from './application/fanout.ts'
import { PUBLIC_EVENT_DEFINITIONS } from './application/public-events.ts'
import { createWebhookService, WEBHOOK_SERVICE } from './application/webhook.service.ts'
import { WEBHOOK_FETCH, WEBHOOKS_CONFIG } from './config.ts'
import { DELIVERY_LOG_DAYS } from './domain/retry.ts'
import { webhookDeliveryRequested } from './events.ts'
import { deliveryRepository } from './infrastructure/delivery.repository.ts'
import { createWebhooks } from './infrastructure/migrations/0001_create_webhooks.ts'
import { createDeliveries } from './infrastructure/migrations/0002_create_deliveries.ts'
import { createAttempts } from './infrastructure/migrations/0003_create_attempts.ts'
import { webhookRepository } from './infrastructure/webhook.repository.ts'
import { WEBHOOK_PERMISSIONS } from './permissions.ts'
import { WEBHOOK_OPERATIONS } from './rest/operations.ts'
import { webhookRoutes } from './rest/webhook.routes.ts'

const deliverDeps = (services: ServiceRegistry, logger: Logger) => ({
  db: services.get(DATABASE),
  events: services.get(EVENT_BUS),
  config: services.get(WEBHOOKS_CONFIG),
  fetch: services.getOptional(WEBHOOK_FETCH) ?? ((request: Request) => fetch(request)),
  logger,
})

/**
 * Webhooks (architecture §15, plan 015): signed HTTP notifications to endpoints a space
 * registers. Needs a `WEBHOOKS_CONFIG` provider (the app reads `WEBHOOK_SECRET_KEYS`).
 */
export const webhooksModule = defineModule({
  meta: {
    name: '@blixis/webhooks',
    version: '0.0.0',
    capabilities: [BLIXIS_CAPABILITIES.webhooks],
    requires: { '@blixis/spaces': '>=0.0.0', '@blixis/permissions': '>=0.0.0' },
    requiresCapabilities: [BLIXIS_CAPABILITIES.database, BLIXIS_CAPABILITIES.events],
  },
  permissions: Object.values(WEBHOOK_PERMISSIONS),
  migrations: [createWebhooks, createDeliveries, createAttempts],
  events: [
    // First attempt as soon as the delivery is requested (015.003); retries come from the sweep.
    subscribe(webhookDeliveryRequested, 'deliver', async ({ payload }, { services, logger }) => {
      await attemptDelivery(deliverDeps(services, logger), payload.deliveryId)
    }),
    // Fan-out (015.002): every public event becomes deliveries for the space's matching webhooks.
    ...PUBLIC_EVENT_DEFINITIONS.map((event) =>
      subscribe(
        event as EventDefinition<string, unknown>,
        `fan-out.${event.type}`,
        (envelope, { services }) =>
          fanOut({ db: services.get(DATABASE), events: services.get(EVENT_BUS) }, envelope).then(
            () => undefined,
          ),
      ),
    ),
    // Space data belongs to its modules: delete this module's rows with the space (plan 008).
    subscribe(spaceDeleted, 'delete-space-webhooks', async ({ payload }, { services }) => {
      await webhookRepository.deleteAllForSpace(services.get(DATABASE), payload)
    }),
  ],
  setup(ctx) {
    // Retries (015.003): due deliveries on the per-minute trigger. Idle runs cost one query and
    // never touch the secret keys.
    ctx.services.get(BACKGROUND_HANDLERS).onScheduled('* * * * *', (event, background) =>
      background
        .runInScope(
          { actor: { type: 'system', component: '@blixis/webhooks.retries' } },
          async ({ services }) => {
            // Log retention (015.004): once an hour, finished deliveries older than 30 days.
            if (new Date(event.scheduledTime).getUTCMinutes() === 7) {
              const removed = await deliveryRepository.deleteOlderThan(
                services.get(DATABASE),
                DELIVERY_LOG_DAYS,
              )
              if (removed > 0) background.logger.info('webhooks.retention', { removed })
            }
            if ((await deliveryRepository.due(services.get(DATABASE), 1)).length === 0) return
            const results = await sweepDueDeliveries(deliverDeps(services, background.logger))
            background.logger.info('webhooks.sweep', { attempted: results.length })
          },
        )
        .then(() => undefined),
    )
    ctx.services.provideFactory(
      WEBHOOK_SERVICE,
      ({ services }) =>
        createWebhookService({
          db: services.get(DATABASE),
          authz: services.get(AUTHORIZATION_SERVICE),
          environments: services.get(ENVIRONMENT_SERVICE),
          events: services.get(EVENT_BUS),
          config: () => services.get(WEBHOOKS_CONFIG),
        }),
      { scope: 'request' },
    )
  },
  rest: {
    path: '/',
    app: new Hono<ModuleHonoEnv>().route('/', webhookRoutes),
    operations: WEBHOOK_OPERATIONS,
  },
})

import {
  AUTHORIZATION_SERVICE,
  BLIXIS_CAPABILITIES,
  type ModuleHonoEnv,
  subscribe,
} from '@blixis/contracts'
import { DATABASE } from '@blixis/database'
import { defineModule } from '@blixis/kernel'
import { ENVIRONMENT_SERVICE, spaceDeleted } from '@blixis/spaces'
import { Hono } from 'hono'
import { createWebhookService, WEBHOOK_SERVICE } from './application/webhook.service.ts'
import { WEBHOOKS_CONFIG } from './config.ts'
import { createWebhooks } from './infrastructure/migrations/0001_create_webhooks.ts'
import { webhookRepository } from './infrastructure/webhook.repository.ts'
import { WEBHOOK_PERMISSIONS } from './permissions.ts'
import { webhookRoutes } from './rest/webhook.routes.ts'

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
  migrations: [createWebhooks],
  events: [
    // Space data belongs to its modules: delete this module's rows with the space (plan 008).
    subscribe(spaceDeleted, 'delete-space-webhooks', async ({ payload }, { services }) => {
      await webhookRepository.deleteAllForSpace(services.get(DATABASE), payload)
    }),
  ],
  setup(ctx) {
    ctx.services.provideFactory(
      WEBHOOK_SERVICE,
      ({ services }) =>
        createWebhookService({
          db: services.get(DATABASE),
          authz: services.get(AUTHORIZATION_SERVICE),
          environments: services.get(ENVIRONMENT_SERVICE),
          config: () => services.get(WEBHOOKS_CONFIG),
        }),
      { scope: 'request' },
    )
  },
  rest: { path: '/', app: new Hono<ModuleHonoEnv>().route('/', webhookRoutes) },
})

import { assetsModule } from '@blixis/assets'
import { authModule } from '@blixis/auth'
import { createCacheApiStore, eventsQueueModule, r2StorageModule } from '@blixis/cloudflare'
import { contentModule } from '@blixis/content'
import type { BlixisModule } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { idempotencyModule } from '@blixis/database/idempotency'
import { eventsModule, queueTransport } from '@blixis/events'
import { outboxModule, outboxTransport } from '@blixis/events/outbox'
import { createMemoryResponseCache, graphqlModule } from '@blixis/graphql'
import { permissionsModule } from '@blixis/permissions'
import { spacesModule } from '@blixis/spaces'
import { usersModule } from '@blixis/users'
import { webhooksModule } from '@blixis/webhooks'
import { authConfigModule } from './auth-config.ts'
import { webhooksConfigModule } from './webhooks-config.ts'

/**
 * The explicit module list of the API Worker (architecture §2.3). Modules are imported by
 * package name and listed here — Blixis never discovers modules automatically.
 */
export const modules: readonly BlixisModule[] = [
  databaseModule(),
  // Best-effort events → EVENTS queue; transactional events → outbox (ADR 0008).
  eventsModule({
    transport: queueTransport({ transactional: outboxTransport() }),
    queues: ['blixis-events-local', 'blixis-events-staging', 'blixis-events-production'],
  }),
  eventsQueueModule(),
  // OBJECT_STORAGE on the ASSETS R2 bucket (ADR 0013).
  r2StorageModule(),
  // Owns events.outbox + events.processed; post-commit dispatch + sweep on the `* * * * *` cron.
  outboxModule(),
  // Idempotency-Key support for command routes (blixis.idempotency_keys).
  idempotencyModule(),
  // Domain modules.
  usersModule(),
  authConfigModule(),
  // Public sign-up is off: create users with `pnpm auth:create-user` (ADR 0009).
  authModule(),
  spacesModule(),
  permissionsModule(),
  contentModule(),
  // Files in the ASSETS bucket with metadata in Postgres (ADR 0013).
  assetsModule(),
  // Signed notifications to endpoints a space registers (plan 015).
  webhooksConfigModule(),
  webhooksModule(),
  // GET/POST /graphql (delivery API, §10) — composed from module contributions. Published
  // delivery responses are cached (ADR 0012): isolate memory, then the Cache API (per data center).
  graphqlModule({
    cache: {
      stores: [
        { store: createMemoryResponseCache(), ttlSeconds: 300 },
        { store: createCacheApiStore(), ttlSeconds: 3600 },
      ],
    },
  }),
]

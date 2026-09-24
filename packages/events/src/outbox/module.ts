import {
  createServiceToken,
  defineMigration,
  InfrastructureError,
  REQUEST_CONTEXT,
  type ServiceToken,
} from '@blixis/contracts'
import { DATABASE, fromTransactionScope, translateDatabaseError } from '@blixis/database'
import { BACKGROUND_HANDLERS, defineModule } from '@blixis/kernel'
import { sql } from 'drizzle-orm'
import type { EventTransport } from '../bus.ts'
import { QUEUE_SENDER } from '../queue.ts'
import { dispatchOutboxBatch, sweepOutbox } from './dispatch.ts'

/** Collects the outbox rows written in the current request scope for post-commit dispatch. */
export interface OutboxPending {
  add(id: string): void
}

/** Request-scoped {@link OutboxPending}, provided by {@link outboxModule}. */
export const OUTBOX_PENDING: ServiceToken<OutboxPending> = createServiceToken<OutboxPending>(
  '@blixis/events.outbox-pending',
)

/** The outbox table (ADR 0008). */
export const createOutbox = defineMigration({
  id: '0001_create_outbox',
  up: /* sql */ `
    create schema if not exists events;
    create table events.outbox (
      id uuid primary key,
      type text not null,
      version integer not null,
      envelope jsonb not null,
      created_at timestamptz not null default now(),
      dispatched_at timestamptz,
      attempts integer not null default 0,
      last_error text
    );
    create index outbox_pending_idx on events.outbox (created_at) where dispatched_at is null;
  `,
})

/**
 * Transport for `transactional` events (§32): inserts the envelope into `events.outbox` with
 * the emitter's transaction and remembers it for post-commit dispatch. Use as
 * `queueTransport({ transactional: outboxTransport() })`.
 */
export function outboxTransport(): EventTransport {
  return {
    async publish(envelope, context) {
      const scope = context.options.transaction
      if (scope === undefined) {
        throw new InfrastructureError(`${envelope.type} needs a transaction for the outbox`)
      }
      const tx = fromTransactionScope(scope)
      try {
        await tx.execute(sql`
          insert into events.outbox (id, type, version, envelope)
          values (${envelope.id}, ${envelope.type}, ${envelope.version}, ${JSON.stringify(envelope)}::jsonb)`)
      } catch (error) {
        throw translateDatabaseError(error)
      }
      context.services.get(OUTBOX_PENDING).add(envelope.id)
    },
  }
}

/** Options for {@link outboxModule}. */
export interface OutboxModuleOptions {
  /** Cron expression of the sweep; must also be in `wrangler.jsonc` triggers. Default every minute. */
  readonly cron?: string
  /** Rows per queue batch. Default 100 (the Queues batch limit). */
  readonly batchSize?: number
  /** Batches per sweep run. Default 10. */
  readonly maxBatches?: number
  /** Rows younger than this are left to post-commit dispatch. Default 5 seconds. */
  readonly minAgeSeconds?: number
  /** Days to keep dispatched rows. Default 7. */
  readonly retentionDays?: number
}

/**
 * Platform module for the transactional outbox (ADR 0008): owns the `events.outbox` migration,
 * dispatches rows written by a request after its scope ends (post-commit, via `waitUntil`), and
 * sweeps pending rows on a cron. Needs `databaseModule()` and a `QUEUE_SENDER` provider.
 */
export const outboxModule = defineModule((options: OutboxModuleOptions) => ({
  meta: { name: '@blixis/events.outbox', version: '0.0.0' },
  migrations: [createOutbox],
  setup(ctx) {
    const batchSize = options.batchSize ?? 100
    ctx.services.provideFactory(
      OUTBOX_PENDING,
      ({ services }) => {
        // Resolved now: the scope is already being disposed when dispatch runs.
        const db = services.get(DATABASE)
        const sender = services.get(QUEUE_SENDER)
        const logger = services.get(REQUEST_CONTEXT).logger
        const ids: string[] = []
        return {
          ids,
          add: (id: string) => void ids.push(id),
          async dispatch() {
            // After commit or rollback: rolled-back ids simply match no rows.
            for (let start = 0; start < ids.length; start += batchSize) {
              await dispatchOutboxBatch(
                db,
                sender,
                { ids: ids.slice(start, start + batchSize) },
                {
                  limit: batchSize,
                  logger,
                },
              )
            }
          },
          logger,
        }
      },
      {
        scope: 'request',
        dispose: async (pending) => {
          const collector = pending as OutboxPending & {
            ids: string[]
            dispatch(): Promise<void>
            logger: { warn(message: string, fields?: Record<string, unknown>): void }
          }
          if (collector.ids.length === 0) return
          await collector.dispatch().catch((error: unknown) => {
            // The sweep delivers whatever the post-commit attempt could not.
            collector.logger.warn('outbox.post_commit_failed', { error: String(error) })
          })
        },
      },
    )
    ctx.services
      .get(BACKGROUND_HANDLERS)
      .onScheduled(options.cron ?? '* * * * *', (_event, background) =>
        background
          .runInScope(
            { actor: { type: 'system', component: '@blixis/events.outbox' } },
            async ({ services }) => {
              await sweepOutbox(services.get(DATABASE), services.get(QUEUE_SENDER), {
                batchSize,
                maxBatches: options.maxBatches ?? 10,
                minAgeSeconds: options.minAgeSeconds ?? 5,
                retentionDays: options.retentionDays ?? 7,
                logger: background.logger,
              })
            },
          )
          .then(() => undefined),
      )
  },
}))

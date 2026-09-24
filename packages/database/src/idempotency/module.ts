import { BACKGROUND_HANDLERS, defineModule } from '@blixis/kernel'
import { sql } from 'drizzle-orm'
import { DATABASE } from '../module.ts'
import {
  createIdempotencyKeys,
  IDEMPOTENCY,
  type IdempotencyOptions,
  postgresIdempotency,
} from './service.ts'

/** Options for {@link idempotencyModule}. */
export interface IdempotencyModuleOptions extends IdempotencyOptions {
  /** Cron expression of the expired-key cleanup (must be in `wrangler.jsonc`). Default every minute. */
  readonly cron?: string
}

/**
 * Platform module for command idempotency (§33): owns `blixis.idempotency_keys`, provides
 * `IDEMPOTENCY` per request (used by the {@link idempotent} middleware), and deletes expired
 * keys on a cron. Needs `databaseModule()`.
 */
export const idempotencyModule = defineModule((options: IdempotencyModuleOptions) => ({
  meta: { name: '@blixis/database.idempotency', version: '0.0.0' },
  migrations: [createIdempotencyKeys],
  setup(ctx) {
    ctx.services.provideFactory(
      IDEMPOTENCY,
      ({ services }) => postgresIdempotency(services.get(DATABASE), options),
      { scope: 'request' },
    )
    ctx.services
      .get(BACKGROUND_HANDLERS)
      .onScheduled(options.cron ?? '* * * * *', (_event, background) =>
        background
          .runInScope(
            { actor: { type: 'system', component: '@blixis/database.idempotency' } },
            async ({ services }) => {
              await services
                .get(DATABASE)
                .execute(sql`delete from blixis.idempotency_keys where expires_at < now()`)
            },
          )
          .then(() => undefined),
      )
  },
}))

import { type CloudflareEnvBase, defineEnvSchema } from '@blixis/cloudflare'
import { z } from 'zod'

/** Bindings and variables of the API Worker. Extended by later plans (Queues, KV, …). */
export interface ApiEnv extends CloudflareEnvBase {
  /** Sentry project DSN; Sentry is disabled when absent (local, tests). */
  readonly SENTRY_DSN?: string
  /** Hyperdrive binding to Neon (local: Docker Postgres). Read by `databaseModule()`. */
  readonly HYPERDRIVE: { readonly connectionString: string }
}

/** Runtime validation of {@link ApiEnv}, applied on the first invocation by `createWorkerHandler`. */
export const apiEnvSchema = defineEnvSchema(
  z.object({
    BLIXIS_ENV: z.enum(['local', 'preview', 'staging', 'production']),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    SENTRY_DSN: z.url().optional(),
    // Shape check only; the connection string is never logged.
    HYPERDRIVE: z.looseObject({ connectionString: z.string().min(1) }),
  }),
)

// Compile-time guard: the bindings generated from wrangler.jsonc (`pnpm types`) must satisfy
// ApiEnv, so configuration and code cannot drift apart silently.
type Assert<T extends true> = T
export type EnvMatchesWranglerConfig = Assert<Env extends ApiEnv ? true : false>

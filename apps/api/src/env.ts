import { type CloudflareEnvBase, defineEnvSchema } from '@blixis/cloudflare'
import { z } from 'zod'

/** Bindings and variables of the API Worker. Extended by later plans (Hyperdrive, Queues, …). */
export interface ApiEnv extends CloudflareEnvBase {}

/** Runtime validation of {@link ApiEnv}, applied on the first invocation by `createWorkerHandler`. */
export const apiEnvSchema = defineEnvSchema(
  z.object({
    BLIXIS_ENV: z.enum(['local', 'preview', 'staging', 'production']),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
  }),
)

// Compile-time guard: the bindings generated from wrangler.jsonc (`pnpm types`) must satisfy
// ApiEnv, so configuration and code cannot drift apart silently.
type Assert<T extends true> = T
export type EnvMatchesWranglerConfig = Assert<Env extends ApiEnv ? true : false>

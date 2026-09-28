import { type CloudflareEnvBase, defineEnvSchema } from '@blixis-io/cloudflare'
import { z } from 'zod'

/** Bindings and variables of the API Worker. Extended by later plans. */
export interface ApiEnv extends CloudflareEnvBase {
  /** Sentry project DSN; Sentry is disabled when absent (local, tests). */
  readonly SENTRY_DSN?: string
  /** Hyperdrive binding to Neon (local: Docker Postgres). Read by `databaseModule()`. */
  readonly HYPERDRIVE: { readonly connectionString: string }
  /** Ed25519 private JWKs (JSON array) signing access tokens — secret (ADR 0009). */
  readonly AUTH_SIGNING_KEYS?: string
  /** `kid:base64key[,…]` AES keys encrypting webhook signing secrets — secret (plan 015). */
  readonly WEBHOOK_SECRET_KEYS?: string
  /** Comma-separated origins allowed for cookie-based refresh/sign-out. */
  readonly AUTH_ALLOWED_ORIGINS?: string
  /** Events queue producer, used only through `@blixis/events` (§15). */
  readonly EVENTS: { sendBatch(messages: Iterable<unknown>): Promise<unknown> }
  /** Asset binaries (R2, ADR 0013), used only through `OBJECT_STORAGE` (`r2StorageModule()`). */
  readonly ASSETS: { createMultipartUpload(key: string, options?: never): Promise<unknown> }
}

/** Runtime validation of {@link ApiEnv}, applied on the first invocation by `createWorkerHandler`. */
export const apiEnvSchema = defineEnvSchema(
  z.object({
    BLIXIS_ENV: z.enum(['local', 'preview', 'staging', 'production']),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    SENTRY_DSN: z.url().optional(),
    // Optional and may be empty: a missing or empty key only breaks /auth/* (checked when used by
    // authConfigModule), never the whole API. An empty secret once took staging down.
    AUTH_SIGNING_KEYS: z.string().optional(),
    AUTH_ALLOWED_ORIGINS: z.string().optional(),
    // Optional like AUTH_SIGNING_KEYS: missing keys only break webhook management and delivery.
    WEBHOOK_SECRET_KEYS: z.string().optional(),
    // Shape check only; the connection string is never logged.
    HYPERDRIVE: z.looseObject({ connectionString: z.string().min(1) }),
    EVENTS: z.custom<unknown>(
      (value) => typeof (value as { sendBatch?: unknown } | null)?.sendBatch === 'function',
      'must be a Queue producer binding',
    ),
    ASSETS: z.custom<unknown>(
      (value) =>
        typeof (value as { createMultipartUpload?: unknown } | null)?.createMultipartUpload ===
        'function',
      'must be an R2 bucket binding',
    ),
  }),
)

// Compile-time guard: the bindings generated from wrangler.jsonc (`pnpm types`) must satisfy
// ApiEnv, so configuration and code cannot drift apart silently.
type Assert<T extends true> = T
export type EnvMatchesWranglerConfig = Assert<Env extends ApiEnv ? true : false>

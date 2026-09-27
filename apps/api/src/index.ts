import { createWorkerHandler } from '@blixis/cloudflare'
import { createBlixis } from '@blixis/kernel'
import * as Sentry from '@sentry/cloudflare'
import { z } from 'zod'
import { modules } from './blixis.config.ts'
import { apiEnvSchema } from './env.ts'
import { sentryErrorReporter, sentryOptions } from './sentry.ts'

// Workers forbid code generation (eval / new Function); keep Zod on its interpreter (ADR 0004).
z.config({ jitless: true })

const app = createBlixis({
  modules,
  errorReporter: sentryErrorReporter,
  // The admin runs on its own origin (ADR 0017): the origins allowed to use the refresh cookie
  // are the ones allowed to call the API from a browser.
  cors: {
    origins: (env) =>
      String(env['AUTH_ALLOWED_ORIGINS'] ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter((origin) => origin !== ''),
  },
})

// withSentry instruments fetch, queue, and scheduled (tracing, uncaught errors); the kernel's
// error reporter adds the 5xx errors it turns into problem responses.
export default Sentry.withSentry(
  sentryOptions,
  createWorkerHandler<Env>(app, { envSchema: apiEnvSchema, errorReporter: sentryErrorReporter }),
)

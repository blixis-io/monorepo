import { createWorkerHandler } from '@blixis-io/cloudflare'
import { createBlixis } from '@blixis-io/kernel'
import * as Sentry from '@sentry/cloudflare'
import { z } from 'zod'
import { modules } from './blixis.config.ts'
import { apiEnvSchema } from './env.ts'
import { sentryErrorReporter, sentryOptions } from './sentry.ts'

// Workers forbid code generation (eval / new Function); keep Zod on its interpreter (ADR 0004).
z.config({ jitless: true })

/** Sentry cron monitor slug for the Worker's scheduled runs (outbox sweep, retention). */
const CRON_MONITOR = 'blixis-api-cron'

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

const handler = createWorkerHandler<Env>(app, {
  envSchema: apiEnvSchema,
  errorReporter: sentryErrorReporter,
})

// withSentry instruments fetch, queue, and scheduled (tracing, uncaught errors); the kernel's
// error reporter adds the 5xx errors it turns into problem responses. Cron runs also check in
// to the Sentry cron monitor `blixis-api-cron`, which alerts on missed, failed, or hung runs
// (docs/operations/observability.md).
export default Sentry.withSentry(sentryOptions, {
  ...handler,
  scheduled: (controller, env, ctx) =>
    Sentry.withMonitor(CRON_MONITOR, () => handler.scheduled(controller, env, ctx), {
      schedule: { type: 'crontab', value: controller.cron },
      timezone: 'Etc/UTC',
      checkinMargin: 2,
      maxRuntime: 5,
      // One missed minute is noise; three in a row is an incident.
      failureIssueThreshold: 3,
      recoveryThreshold: 1,
    }),
})

import type { ErrorReporter } from '@blixis/kernel'
import * as Sentry from '@sentry/cloudflare'

type SentryEvent = Parameters<NonNullable<Sentry.CloudflareOptions['beforeSend']>>[0]

const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'proxy-authorization',
]

/** Removes credentials from events before they leave the Worker (architecture §35). */
export function scrubEvent<E extends SentryEvent>(event: E): E {
  const request = event.request
  if (request !== undefined) {
    if (request.headers !== undefined) {
      for (const name of Object.keys(request.headers)) {
        if (SENSITIVE_HEADERS.includes(name.toLowerCase())) delete request.headers[name]
      }
    }
    delete request.cookies
    delete request.data
    if (
      typeof request.query_string === 'string' &&
      /token|key|secret|signature/i.test(request.query_string)
    ) {
      delete request.query_string
    }
  }
  return event
}

/**
 * Sentry options per invocation. Returns `undefined` (Sentry disabled) when no `SENTRY_DSN` is
 * configured — the default for local development and tests.
 */
export function sentryOptions(env: Env): Sentry.CloudflareOptions | undefined {
  const dsn = (env as { SENTRY_DSN?: string }).SENTRY_DSN
  if (dsn === undefined || dsn === '') return undefined
  return {
    dsn,
    environment: env.BLIXIS_ENV,
    // release: the SDK uses SENTRY_RELEASE if set, else the CF_VERSION_METADATA version id.
    tracesSampleRate: env.BLIXIS_ENV === 'production' ? 0.1 : 1.0,
    // Privacy first (§35): no bodies, cookies, or user info; credentials headers never sent.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpBodies: [],
      httpHeaders: { request: { deny: SENSITIVE_HEADERS }, response: false },
      urlQueryParams: { deny: ['token', 'key', 'secret', 'signature', 'code'] },
    },
    beforeSend: (event) => scrubEvent(event),
  }
}

/** Kernel error reporter that sends unexpected 5xx errors to Sentry with trace tags. */
export const sentryErrorReporter: ErrorReporter = {
  captureException(error, context) {
    Sentry.withScope((scope) => {
      for (const [key, value] of Object.entries(context)) {
        if (value !== undefined) scope.setTag(key, String(value))
      }
      Sentry.captureException(error)
    })
  },
}

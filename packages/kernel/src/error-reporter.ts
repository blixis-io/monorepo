import { createServiceToken } from '@blixis/contracts'

/** Context attached to a reported error. Never contains secrets or request bodies. */
export interface ErrorReportContext {
  readonly requestId?: string
  readonly correlationId?: string
  readonly method?: string
  /** Matched route pattern (e.g. `/api/v1/entries/:id`), not the raw URL. */
  readonly route?: string
  readonly status?: number
  readonly actorType?: string
  readonly spaceId?: string
  /** Module that raised the error, when known (`ModuleError`). */
  readonly module?: string
}

/**
 * Receives unexpected errors (5xx) for an error-tracking service such as Sentry (roadmap
 * 004.007). Expected client errors (4xx `BlixisError`s) are never reported. Implementations must
 * not throw and must not block the response.
 */
export interface ErrorReporter {
  captureException(error: unknown, context: ErrorReportContext): void
}

/**
 * The app's {@link ErrorReporter}, when one is configured (`createBlixis({ errorReporter })`).
 * Lets transports outside the REST error handler, such as GraphQL, report unexpected errors too.
 */
export const ERROR_REPORTER = createServiceToken<ErrorReporter>('@blixis/kernel.error-reporter')

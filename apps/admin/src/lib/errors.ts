import { BlixisApiError } from '@blixis-io/sdk'

/** What the UI shows for a failed call: a message and, for support, the request id. */
export interface ErrorDescription {
  readonly title: string
  readonly message: string
  readonly requestId?: string | undefined
}

const MESSAGES: Record<string, { title: string; message?: string }> = {
  VALIDATION_FAILED: { title: 'Check the highlighted values' },
  NOT_FOUND: {
    title: 'Not found',
    message: 'It doesn’t exist, or you don’t have access to it.',
  },
  CONFLICT: { title: 'Conflict' },
  FORBIDDEN: { title: 'Not allowed', message: 'Your role doesn’t allow this.' },
  UNAUTHORIZED: { title: 'Signed out', message: 'Your session ended. Sign in again.' },
  RATE_LIMITED: { title: 'Too many requests', message: 'Wait a moment, then try again.' },
  NETWORK_ERROR: {
    title: 'Can’t reach the server',
    message: 'Check your connection and try again.',
  },
  INFRASTRUCTURE_ERROR: {
    title: 'Service unavailable',
    message: 'A backing service is unavailable. Try again shortly.',
  },
}

/** Maps an error (usually `BlixisApiError`) to UI text; unknown errors get a generic message. */
export function describeError(error: unknown): ErrorDescription {
  if (error instanceof BlixisApiError) {
    const known = MESSAGES[error.code]
    const validation = error.errors.map((e) => e.message).join(' ')
    return {
      title: known?.title ?? 'Something went wrong',
      message:
        error.code === 'VALIDATION_FAILED' && validation !== ''
          ? validation
          : (known?.message ?? error.message),
      requestId: error.requestId,
    }
  }
  return {
    title: 'Something went wrong',
    message: error instanceof Error ? error.message : 'An unexpected error occurred.',
  }
}

/** Whether retrying the same request can help (network, 5xx, rate limits), not 4xx mistakes. */
export function isRetryable(error: unknown): boolean {
  if (!(error instanceof BlixisApiError)) return true
  return error.status === 0 || error.status === 429 || error.status >= 500
}

import type { Problem } from './generated/api.ts'

/** Error codes of the API (docs/contracts/errors.md), plus the SDK's own `NETWORK_ERROR`. */
export type BlixisErrorCode = Problem['code'] | 'NETWORK_ERROR'

/**
 * A failed API call. `code` is the stable machine-readable error code; `requestId` identifies the
 * request in the server's logs (quote it in support requests).
 */
export class BlixisApiError extends Error {
  override readonly name = 'BlixisApiError'
  /** HTTP status; `0` when the request never got an answer. */
  readonly status: number
  readonly code: BlixisErrorCode
  readonly requestId: string | undefined
  /** Validation issues (`VALIDATION_FAILED`): where and what. */
  readonly errors: NonNullable<Problem['errors']>
  /** Other details the server exposed. */
  readonly details: unknown

  constructor(
    message: string,
    init: {
      status: number
      code: BlixisErrorCode
      requestId?: string | undefined
      errors?: Problem['errors']
      details?: unknown
      cause?: unknown
    },
  ) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause })
    this.status = init.status
    this.code = init.code
    this.requestId = init.requestId
    this.errors = init.errors ?? []
    this.details = init.details
  }

  /** Builds the error from a problem-details response. */
  static async fromResponse(response: Response): Promise<BlixisApiError> {
    const text = await response.text().catch(() => '')
    let problem: Partial<Problem> = {}
    try {
      problem = JSON.parse(text) as Partial<Problem>
    } catch {}
    return new BlixisApiError(problem.detail ?? problem.title ?? `HTTP ${response.status}`, {
      status: response.status,
      code: problem.code ?? (response.status === 429 ? 'RATE_LIMITED' : 'INTERNAL'),
      requestId: problem.requestId ?? response.headers.get('x-request-id') ?? undefined,
      errors: problem.errors,
      details: problem.details,
    })
  }
}

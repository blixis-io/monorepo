import {
  type ErrorCode,
  isBlixisError,
  toPublicErrorShape,
  type ValidationIssue,
} from '@blixis/contracts'

/** HTTP status per public error code (docs: manual → concepts/errors). */
const STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  MODULE_ERROR: 500,
  INFRASTRUCTURE_ERROR: 500,
  INTERNAL: 500,
}

const TITLES: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'Validation failed',
  UNAUTHORIZED: 'Unauthorized',
  FORBIDDEN: 'Forbidden',
  NOT_FOUND: 'Not found',
  CONFLICT: 'Conflict',
  RATE_LIMITED: 'Too many requests',
  MODULE_ERROR: 'Internal error',
  INFRASTRUCTURE_ERROR: 'Service unavailable',
  INTERNAL: 'Internal error',
}

/** RFC 9457 problem details body used for every Blixis error response. */
export interface ProblemDetails {
  /** `urn:blixis:problem:<CODE>` */
  readonly type: string
  readonly title: string
  readonly status: number
  readonly code: ErrorCode
  readonly detail: string
  readonly requestId: string
  /** Validation issues, for `VALIDATION_FAILED`. */
  readonly errors?: readonly ValidationIssue[]
  /** Other exposed details. */
  readonly details?: unknown
}

/** HTTP status for any thrown value. Retryable infrastructure errors map to 503. */
export function httpStatusFor(error: unknown): number {
  if (!isBlixisError(error)) return 500
  if (
    error.code === 'INFRASTRUCTURE_ERROR' &&
    (error as { retryable?: boolean }).retryable === true
  )
    return 503
  return STATUS[error.code]
}

/** Builds the problem details response for any thrown value (redacting non-public errors). */
export function toProblemResponse(error: unknown, requestId: string): Response {
  const shape = toPublicErrorShape(error)
  const status = httpStatusFor(error)
  const issues =
    shape.code === 'VALIDATION_FAILED' &&
    typeof shape.details === 'object' &&
    shape.details !== null &&
    'issues' in shape.details
      ? (shape.details as { issues: readonly ValidationIssue[] }).issues
      : undefined
  const body: ProblemDetails = {
    type: `urn:blixis:problem:${shape.code}`,
    title: TITLES[shape.code],
    status,
    code: shape.code,
    detail: shape.message,
    requestId,
    ...(issues === undefined ? {} : { errors: issues }),
    ...(issues === undefined && shape.details !== undefined ? { details: shape.details } : {}),
  }
  const headers = new Headers({ 'content-type': 'application/problem+json' })
  const retryAfter = isBlixisError(error)
    ? (error as { retryAfterSeconds?: number }).retryAfterSeconds
    : undefined
  if (retryAfter !== undefined) headers.set('retry-after', String(Math.ceil(retryAfter)))
  return new Response(JSON.stringify(body), { status, headers })
}

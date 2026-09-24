/** Stable, machine-readable error codes shared by all transports (architecture §28). */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'MODULE_ERROR'
  | 'INFRASTRUCTURE_ERROR'
  | 'INTERNAL'

/** One problem found while validating untrusted input. */
export interface ValidationIssue {
  /** Location of the problem, e.g. `['fields', 'title', 'en-US']`. Empty for the root value. */
  readonly path: readonly (string | number)[]
  readonly message: string
  /** Optional machine-readable code from the validator. */
  readonly code?: string
}

/** The error shape transports may send to clients. */
export interface PublicErrorShape {
  readonly code: ErrorCode
  readonly message: string
  readonly details?: unknown
}

/** Options accepted by every Blixis error. */
export interface BlixisErrorOptions {
  /** JSON-serialisable details, sent to clients only when the error is exposed. */
  readonly details?: unknown
  /** Underlying error; never sent to clients. */
  readonly cause?: unknown
}

const BRAND: unique symbol = Symbol.for('@blixis/contracts.error')

/**
 * Base class of all public Blixis errors. Services throw these; transports (REST, GraphQL,
 * queue consumers) map `code` to their protocol. Never throw transport-specific errors
 * from services.
 */
export abstract class BlixisError extends Error {
  /** Brand used by {@link isBlixisError}; survives duplicated package instances. */
  readonly [BRAND] = true
  abstract readonly code: ErrorCode
  /** Whether `message` and `details` are safe to show to clients. */
  readonly expose: boolean = true
  declare readonly details?: unknown

  constructor(message: string, options: BlixisErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = new.target.name
    if (options.details !== undefined) this.details = options.details
  }
}

/** Untrusted input failed validation. */
export class ValidationError extends BlixisError {
  readonly code = 'VALIDATION_FAILED'
  readonly issues: readonly ValidationIssue[]

  constructor(
    message: string,
    issues: readonly ValidationIssue[] = [],
    options: BlixisErrorOptions = {},
  ) {
    super(message, { ...options, details: options.details ?? { issues } })
    this.issues = issues
  }
}

/** The requested resource does not exist or is not visible to the actor. */
export class NotFoundError extends BlixisError {
  readonly code = 'NOT_FOUND'
}

/** The request conflicts with the current state (duplicate, stale version, invariant). */
export class ConflictError extends BlixisError {
  readonly code = 'CONFLICT'
}

/** The actor is known but not allowed to perform the action. */
export class ForbiddenError extends BlixisError {
  readonly code = 'FORBIDDEN'
}

/** No valid credentials were presented. */
export class UnauthorizedError extends BlixisError {
  readonly code = 'UNAUTHORIZED'
}

/** Too many requests; `retryAfterSeconds` tells clients when to retry. */
export class RateLimitError extends BlixisError {
  readonly code = 'RATE_LIMITED'
  declare readonly retryAfterSeconds?: number

  constructor(message: string, options: BlixisErrorOptions & { retryAfterSeconds?: number } = {}) {
    super(message, options)
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds
  }
}

/** A module is misconfigured or broke the module contract. Always names the module. */
export class ModuleError extends BlixisError {
  readonly code = 'MODULE_ERROR'
  override readonly expose = false
  readonly moduleName: string

  constructor(moduleName: string, message: string, options: BlixisErrorOptions = {}) {
    super(`[${moduleName}] ${message}`, options)
    this.moduleName = moduleName
  }
}

/** A dependency (database, queue, storage, network) failed. Never exposes its message. */
export class InfrastructureError extends BlixisError {
  readonly code = 'INFRASTRUCTURE_ERROR'
  override readonly expose = false
  /** Whether retrying the operation may succeed (e.g. serialisation failure, timeout). */
  readonly retryable: boolean

  constructor(message: string, options: BlixisErrorOptions & { retryable?: boolean } = {}) {
    super(message, options)
    this.retryable = options.retryable ?? false
  }
}

/**
 * Whether `value` is a Blixis error. Uses a `Symbol.for` brand instead of `instanceof` so it
 * works when several copies of `@blixis/contracts` are loaded.
 */
export function isBlixisError(value: unknown): value is BlixisError {
  return (
    typeof value === 'object' && value !== null && (value as { [BRAND]?: unknown })[BRAND] === true
  )
}

const GENERIC_MESSAGES: Readonly<Record<ErrorCode, string>> = {
  VALIDATION_FAILED: 'The request is invalid.',
  NOT_FOUND: 'The resource was not found.',
  CONFLICT: 'The request conflicts with the current state.',
  FORBIDDEN: 'You are not allowed to perform this action.',
  UNAUTHORIZED: 'Authentication is required.',
  RATE_LIMITED: 'Too many requests.',
  MODULE_ERROR: 'An internal error occurred.',
  INFRASTRUCTURE_ERROR: 'A temporary error occurred. Please try again.',
  INTERNAL: 'An internal error occurred.',
}

/**
 * Converts any thrown value into the shape clients may see. Non-exposed errors and unknown
 * values are redacted; stack traces and causes are never included.
 */
export function toPublicErrorShape(error: unknown): PublicErrorShape {
  if (!isBlixisError(error)) {
    return { code: 'INTERNAL', message: GENERIC_MESSAGES.INTERNAL }
  }
  if (!error.expose) {
    return { code: error.code, message: GENERIC_MESSAGES[error.code] }
  }
  return error.details === undefined
    ? { code: error.code, message: error.message }
    : { code: error.code, message: error.message, details: error.details }
}

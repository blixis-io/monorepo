import type { Actor } from './permissions.ts'
import type { ServiceRegistry } from './services.ts'

declare const TRANSACTION_SCOPE: unique symbol

/**
 * Opaque handle for an open database transaction. Created and interpreted only by
 * `@blixis/database`; contracts never expose the underlying client (architecture §4).
 * Passing it to `EventBus.emit` writes transactional events in the same transaction (§32).
 */
export interface TransactionScope {
  readonly [TRANSACTION_SCOPE]: true
}

/** Structured log fields (§35). Values must be JSON-serialisable; never include secrets. */
export type LogFields = Readonly<Record<string, unknown>>

/**
 * Minimal structured logger. Implementations add standard fields (`requestId`,
 * `correlationId`, `module`, …) and redact secrets. Modules never use `console` directly.
 */
export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
  /** Returns a logger that adds `fields` to every entry. */
  child(fields: LogFields): Logger
}

/** Tenant the current operation is scoped to (§31). Verified by the tenancy layer (plan 008). */
export interface TenantContext {
  readonly organizationId?: string
  readonly spaceId?: string
  readonly environmentId?: string
}

/**
 * Transport-independent context of one request, event delivery, cron run, or workflow step.
 * REST, GraphQL, queue consumers, and Workflows all call services with it (§2.4).
 */
export interface RequestContext {
  /** Unique id of this request/invocation. */
  readonly requestId: string
  /** Id shared by everything caused by the same original request (§35). */
  readonly correlationId: string
  readonly actor: Actor
  readonly tenant: TenantContext
  /** Logger already bound to `requestId`, `correlationId`, and actor fields. */
  readonly logger: Logger
  /** Services resolved in this request's scope (request-scoped services live here). */
  readonly services: ServiceRegistry
  /** Current time; injectable for deterministic tests. */
  now(): Date
  /** Aborted when the request is cancelled or times out, if the transport supports it. */
  readonly signal?: CancellationSignal
}

/**
 * Minimal cancellation signal. A platform `AbortSignal` satisfies it; declared structurally so
 * contracts do not depend on DOM or Workers type libraries.
 */
export interface CancellationSignal {
  readonly aborted: boolean
  readonly reason?: unknown
}

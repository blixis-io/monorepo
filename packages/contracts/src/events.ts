import type { Logger, TransactionScope } from './context.ts'
import type { ServiceRegistry } from './services.ts'
import type { StandardSchemaV1 } from './standard-schema.ts'
import type { InferOutput } from './validation.ts'

/**
 * Serialisable envelope for every domain/platform event (architecture §15).
 * All fields are JSON-safe: timestamps are ISO-8601 strings, no class instances.
 */
export interface EventEnvelope<TType extends string = string, TPayload = unknown> {
  /** Unique event id (UUIDv7); used for idempotent consumption (§33). */
  readonly id: string
  readonly type: TType
  /** Payload schema version; bump when the payload changes incompatibly. */
  readonly version: number
  /** ISO-8601 timestamp of emission. */
  readonly timestamp: string
  readonly tenantId?: string
  readonly spaceId?: string
  readonly payload: TPayload
  readonly metadata?: EventMetadata
}

/** Tracing metadata carried by events (§35). */
export interface EventMetadata {
  readonly correlationId?: string
  readonly actorId?: string
  /** Emitting module, e.g. `@blixis/content`. */
  readonly source?: string
}

/**
 * Consistency guarantee of an event class (§32):
 * - `transactional`: written to the outbox inside the emitting database transaction; never
 *   lost if the transaction commits, never delivered if it rolls back.
 * - `best-effort`: sent after the operation; may be lost on failure. Only for side effects
 *   whose loss does not corrupt system state.
 */
export type EventDelivery = 'transactional' | 'best-effort'

/** A typed, versioned event definition created with {@link defineEvent}. */
export interface EventDefinition<TType extends string = string, TPayload = unknown> {
  readonly type: TType
  readonly version: number
  /** Schema used to validate payloads on emit and on consume. */
  readonly schema: StandardSchemaV1<unknown, TPayload>
  readonly delivery: EventDelivery
  /** Human-readable description, used in generated docs. */
  readonly description?: string
}

/** Event type naming rule: `<aggregate>.<past-tense-verb>` with optional sub-aggregates. */
export type EventType = `${string}.${string}`

const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/

/**
 * Defines a typed event. The payload type is inferred from the schema.
 *
 * @example
 * export const entryPublished = defineEvent({
 *   type: 'entry.published', version: 1, delivery: 'transactional',
 *   schema: z.object({ entryId: z.string(), spaceId: z.string(), versionId: z.string() }),
 * })
 */
export function defineEvent<TType extends EventType, TSchema extends StandardSchemaV1>(definition: {
  readonly type: TType
  readonly version: number
  readonly schema: TSchema
  readonly delivery: EventDelivery
  readonly description?: string
}): EventDefinition<TType, InferOutput<TSchema>> {
  if (!EVENT_TYPE_PATTERN.test(definition.type)) {
    throw new TypeError(
      `Invalid event type "${definition.type}": use lowercase "<aggregate>.<verb>" (e.g. "entry.published")`,
    )
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new TypeError(`Invalid version for event "${definition.type}": must be an integer >= 1`)
  }
  return Object.freeze({ ...definition }) as EventDefinition<TType, InferOutput<TSchema>>
}

/** Payload type of an event definition. */
export type EventPayload<TEvent> = TEvent extends EventDefinition<string, infer P> ? P : never

/** Options for {@link EventBus.emit}. */
export interface EmitOptions {
  /** Required for `transactional` events: the transaction the outbox row is written in. */
  readonly transaction?: TransactionScope
  /** Overrides tenant fields otherwise taken from the request context. */
  readonly spaceId?: string
  readonly tenantId?: string
}

/** Publishes events. Domain code uses this, never Cloudflare Queues directly (§15). */
export interface EventBus {
  emit<TType extends string, TPayload>(
    event: EventDefinition<TType, TPayload>,
    payload: TPayload,
    options?: EmitOptions,
  ): Promise<void>
}

/** Context available to event handlers. Each handler runs in its own request scope. */
export interface EventHandlerContext {
  /** Delivery attempt, starting at 1 (retries increase it). */
  readonly attempt: number
  /** Logger bound to `eventId`, `eventType`, `correlationId`, and the subscribing module. */
  readonly logger: Logger
  /** Services resolved in the handler's scope. */
  readonly services: ServiceRegistry
}

/** A module's subscription to an event (§5 `events`). Handlers must be idempotent (§33). */
export interface EventSubscription<TType extends string = string, TPayload = unknown> {
  /** Stable handler id, unique within the module; key for idempotency records. */
  readonly id: string
  readonly event: EventDefinition<TType, TPayload>
  /** Payload versions this handler accepts; defaults to `[event.version]`. */
  readonly versions?: readonly number[]
  readonly handle: (
    envelope: EventEnvelope<TType, TPayload>,
    context: EventHandlerContext,
  ) => Promise<void>
}

/** Creates a typed subscription; infers the envelope type from the event definition. */
export function subscribe<TType extends string, TPayload>(
  event: EventDefinition<TType, TPayload>,
  id: string,
  handle: EventSubscription<TType, TPayload>['handle'],
  options: { readonly versions?: readonly number[] } = {},
): EventSubscription<TType, TPayload> {
  return options.versions === undefined
    ? { id, event, handle }
    : { id, event, handle, versions: options.versions }
}

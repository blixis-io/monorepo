import {
  type EmitOptions,
  type EventBus,
  type EventDefinition,
  type EventEnvelope,
  ModuleError,
  type RequestContext,
  type ServiceRegistry,
} from '@blixis/contracts'
import { createEnvelope } from './envelope.ts'
import type { EventRegistry } from './registry.ts'

/** What a transport receives with each envelope. */
export interface PublishContext {
  readonly definition: EventDefinition
  readonly options: EmitOptions
  /** Services of the emitting request scope (e.g. the database for the outbox). */
  readonly services: ServiceRegistry
}

/**
 * Delivers envelopes: in-process (tests, 006.002), Cloudflare Queues (006.003), or the
 * transactional outbox (006.005). The bus validates and builds envelopes; transports only move
 * them.
 */
export interface EventTransport {
  publish(envelope: EventEnvelope, context: PublishContext): Promise<void>
}

/** Options for {@link createEventBus}. */
export interface CreateEventBusOptions {
  readonly registry: EventRegistry
  readonly transport: EventTransport
  /**
   * The emitting request's context, read **at emit time**: a tenant bound after the bus was
   * created (e.g. by `spaceScoped()`) must still reach the envelope.
   */
  readonly context:
    | Pick<RequestContext, 'tenant' | 'correlationId' | 'actor' | 'now'>
    | (() => Pick<RequestContext, 'tenant' | 'correlationId' | 'actor' | 'now'>)
  readonly services: ServiceRegistry
}

/**
 * Creates the request-scoped {@link EventBus}. `emit` registers the definition (conflicts with
 * a different definition of the same type and version fail), refuses transactional events
 * without a transaction, builds a validated envelope, and hands it to the transport.
 */
export function createEventBus(options: CreateEventBusOptions): EventBus {
  return {
    async emit(definition, payload, emitOptions = {}) {
      options.registry.register(definition as EventDefinition, 'an emitter')
      if (definition.delivery === 'transactional' && emitOptions.transaction === undefined) {
        throw new ModuleError(
          '@blixis/events',
          `${definition.type} is a transactional event: pass { transaction } to emit()`,
        )
      }
      const context = typeof options.context === 'function' ? options.context() : options.context
      const envelope = await createEnvelope(definition, payload, context, emitOptions)
      await options.transport.publish(envelope as EventEnvelope, {
        definition: definition as EventDefinition,
        options: emitOptions,
        services: options.services,
      })
    },
  }
}

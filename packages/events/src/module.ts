import {
  BLIXIS_CAPABILITIES,
  createServiceToken,
  EVENT_BUS,
  InfrastructureError,
  REQUEST_CONTEXT,
  type ServiceToken,
} from '@blixis/contracts'
import { BACKGROUND_HANDLERS, defineModule, KERNEL_CONTRIBUTIONS } from '@blixis/kernel'
import { createEventBus, type EventTransport } from './bus.ts'
import { consumeEventBatch } from './consumer.ts'
import { EventRegistry } from './registry.ts'

/** The app's {@link EventRegistry} (app scope). */
export const EVENT_REGISTRY: ServiceToken<EventRegistry> =
  createServiceToken<EventRegistry>('@blixis/events.registry')

/** Options for {@link eventsModule}. */
export interface EventsModuleOptions {
  /**
   * How envelopes are delivered. Without a transport, `emit` fails with `InfrastructureError`
   * rather than dropping events silently.
   */
  readonly transport?: EventTransport
  /**
   * Queues whose messages are event envelopes to dispatch to module subscriptions, e.g.
   * `['blixis-events-staging']`. List every environment's queue name; the Worker only receives
   * batches of queues it consumes (`wrangler.jsonc`).
   */
  readonly queues?: readonly string[]
}

const noTransport: EventTransport = {
  publish: () =>
    Promise.reject(
      new InfrastructureError('No event transport configured (eventsModule({ transport }))'),
    ),
}

/**
 * Platform module for events (architecture §15): provides the request-scoped `EVENT_BUS`
 * (contracts) and the app-scoped {@link EVENT_REGISTRY}, and the `blixis.events` capability.
 * During setup it registers the event definitions of every module subscription, so conflicting
 * definitions fail at startup.
 *
 * @example
 * const app = createBlixis({ modules: [databaseModule(), eventsModule({ transport }), content()] })
 * // in a service: await ctx.services.get(EVENT_BUS).emit(entryPublished, payload, { transaction })
 */
export const eventsModule = defineModule((options: EventsModuleOptions) => ({
  meta: {
    name: '@blixis/events',
    version: '0.0.0',
    capabilities: [BLIXIS_CAPABILITIES.events],
  },
  setup(ctx) {
    const registry = new EventRegistry()
    for (const { module, value } of ctx.services.get(KERNEL_CONTRIBUTIONS).subscriptions) {
      registry.register(value.event, module)
    }
    const transport = options.transport ?? noTransport
    ctx.services.provide(EVENT_REGISTRY, registry)
    const { subscriptions } = ctx.services.get(KERNEL_CONTRIBUTIONS)
    for (const queue of options.queues ?? []) {
      ctx.services
        .get(BACKGROUND_HANDLERS)
        .onQueue(queue, (batch, background) =>
          consumeEventBatch(batch, { subscriptions, registry, ...background }),
        )
    }
    ctx.services.provideFactory(
      EVENT_BUS,
      ({ services }) =>
        createEventBus({
          registry,
          transport,
          context: () => services.get(REQUEST_CONTEXT),
          services,
        }),
      { scope: 'request' },
    )
  },
}))

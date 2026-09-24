/**
 * `@blixis/events` — how modules publish and receive events (architecture §15, §32, §33):
 * the event definition registry, validated serialisable envelopes, and the request-scoped
 * `EVENT_BUS` with pluggable transports. No Cloudflare dependency.
 *
 * @packageDocumentation
 */
export {
  type CreateEventBusOptions,
  createEventBus,
  type EventTransport,
  type PublishContext,
} from './bus.ts'
export { type ConsumeOptions, consumeEventBatch, retryDelaySeconds } from './consumer.ts'
export {
  type DispatchOptions,
  type DispatchResult,
  dispatchEnvelope,
  matches,
} from './dispatch.ts'
export { actorIdOf, createEnvelope, type EnvelopeContext, parseEnvelope } from './envelope.ts'
export {
  type InProcessMode,
  type InProcessTransport,
  inProcessTransport,
} from './in-process.ts'
export { assertJsonValue } from './json.ts'
export { EVENT_REGISTRY, type EventsModuleOptions, eventsModule } from './module.ts'
export {
  QUEUE_SENDER,
  type QueueSender,
  type QueueTransportOptions,
  queueTransport,
} from './queue.ts'
export { EventRegistry } from './registry.ts'

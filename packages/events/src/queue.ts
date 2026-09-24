import {
  createServiceToken,
  type EventEnvelope,
  InfrastructureError,
  type ServiceToken,
} from '@blixis/contracts'
import type { EventTransport } from './bus.ts'

/**
 * Port for sending envelopes to a message queue (architecture §15). Implemented by
 * `@blixis/cloudflare` for Cloudflare Queues; domain code never touches the queue binding.
 */
export interface QueueSender {
  /** Sends envelopes as JSON messages. Fails as a whole or not at all per batch. */
  send(envelopes: readonly EventEnvelope[]): Promise<void>
}

/** Request-scoped {@link QueueSender}, provided by a platform adapter (e.g. `eventsQueueModule()`). */
export const QUEUE_SENDER: ServiceToken<QueueSender> = createServiceToken<QueueSender>(
  '@blixis/events.queue-sender',
)

/** Options for {@link queueTransport}. */
export interface QueueTransportOptions {
  /**
   * Transport for `transactional` events — the outbox (006.005). Without it, emitting a
   * transactional event fails: sending it directly would break the §32 guarantee.
   */
  readonly transactional?: EventTransport
}

/**
 * Production routing (§32): `best-effort` events go straight to the queue through
 * {@link QUEUE_SENDER}; `transactional` events go to the outbox transport. No in-process
 * fan-out: every subscriber is reached through the queue, with retries and a DLQ.
 */
export function queueTransport(options: QueueTransportOptions = {}): EventTransport {
  return {
    async publish(envelope, context) {
      if (context.definition.delivery === 'transactional') {
        if (options.transactional === undefined) {
          throw new InfrastructureError(
            `${envelope.type} is transactional, but no outbox transport is configured`,
          )
        }
        await options.transactional.publish(envelope, context)
        return
      }
      await context.services.get(QUEUE_SENDER).send([envelope])
    },
  }
}

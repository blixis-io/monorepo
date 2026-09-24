import { type EventEnvelope, InfrastructureError } from '@blixis/contracts'
import { QUEUE_SENDER, type QueueSender } from '@blixis/events'
import { defineModule } from '@blixis/kernel'

/** Cloudflare Queues limits (https://developers.cloudflare.com/queues/platform/limits/). */
export const QUEUE_LIMITS = Object.freeze({
  /** Maximum size of one message. */
  messageBytes: 128 * 1024,
  /** Maximum messages per `sendBatch`. */
  batchMessages: 100,
  /** Maximum total size of one `sendBatch`. */
  batchBytes: 256 * 1024,
})

/** Structural subset of a Cloudflare `Queue` producer binding used here. */
export interface QueueProducerLike {
  sendBatch(messages: Iterable<{ body: unknown; contentType?: 'json' }>): Promise<unknown>
}

const encoder = new TextEncoder()

/**
 * {@link QueueSender} for a Cloudflare Queue producer binding. Sends JSON messages with
 * `sendBatch`, split into chunks within the batch limits.
 *
 * @throws InfrastructureError when an envelope exceeds the message size limit (named by event
 * type and id). Event payloads should carry IDs, not documents.
 */
export function cloudflareQueueSender(queue: QueueProducerLike): QueueSender {
  return {
    async send(envelopes) {
      let chunk: EventEnvelope[] = []
      let chunkBytes = 0
      const flush = async () => {
        if (chunk.length === 0) return
        const messages = chunk.map((body) => ({ body, contentType: 'json' as const }))
        chunk = []
        chunkBytes = 0
        try {
          await queue.sendBatch(messages)
        } catch (error) {
          throw new InfrastructureError('Sending events to the queue failed', {
            cause: error,
            retryable: true,
          })
        }
      }
      for (const envelope of envelopes) {
        const bytes = encoder.encode(JSON.stringify(envelope)).byteLength
        if (bytes > QUEUE_LIMITS.messageBytes) {
          throw new InfrastructureError(
            `Event ${envelope.type} (${envelope.id}) is ${bytes} bytes; queue messages are limited to ${QUEUE_LIMITS.messageBytes}. Send IDs, not documents.`,
          )
        }
        if (
          chunk.length === QUEUE_LIMITS.batchMessages ||
          chunkBytes + bytes > QUEUE_LIMITS.batchBytes
        ) {
          await flush()
        }
        chunk.push(envelope)
        chunkBytes += bytes
      }
      await flush()
    },
  }
}

/** Options for {@link eventsQueueModule}. */
export interface EventsQueueModuleOptions {
  /** Name of the Queue producer binding. Default `EVENTS`. */
  readonly binding?: string
}

/**
 * Platform module providing `QUEUE_SENDER` (from `@blixis/events`) per request, backed by the
 * Worker's Queue producer binding. Use with `eventsModule({ transport: queueTransport(...) })`.
 */
export const eventsQueueModule = defineModule((options: EventsQueueModuleOptions) => ({
  meta: { name: '@blixis/cloudflare.events-queue', version: '0.0.0' },
  setup(ctx) {
    const name = options.binding ?? 'EVENTS'
    ctx.services.provideFactory(
      QUEUE_SENDER,
      ({ bindings }) => {
        const queue = bindings[name] as QueueProducerLike | undefined
        if (queue === undefined || typeof queue.sendBatch !== 'function') {
          throw new InfrastructureError(`Queue binding "${name}" is missing`)
        }
        return cloudflareQueueSender(queue)
      },
      { scope: 'request' },
    )
  },
}))

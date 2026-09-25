import { type EventSubscription, type Logger, ValidationError } from '@blixis/contracts'
import type { Attributed, QueueBatchLike, QueueMessageLike, RunInScope } from '@blixis/kernel'
import { dispatchEnvelope } from './dispatch.ts'
import type { EventRegistry } from './registry.ts'

/** Retry delay for a failed delivery: 5 s doubling per attempt, capped at 10 minutes. */
export function retryDelaySeconds(attempts: number): number {
  return Math.min(5 * 2 ** Math.max(0, attempts - 1), 600)
}

/** Dependencies of {@link consumeEventBatch}. */
export interface ConsumeOptions {
  readonly subscriptions: readonly Attributed<EventSubscription>[]
  readonly registry: EventRegistry
  readonly runInScope: RunInScope
  readonly logger: Logger
}

const field = (body: unknown, name: string): unknown =>
  typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[name] : undefined

/**
 * Handles one queue batch of event envelopes (architecture §15, §33). Messages are processed
 * concurrently; each is:
 *
 * - **acked** when every matching subscription succeeded (or none matched);
 * - **retried** with exponential backoff when any subscription failed — idempotency records
 *   (006.006) keep succeeded subscriptions from running twice;
 * - **acked** without dispatch when no subscription handles its type (`event.unrouted`);
 * - **retried** when the envelope is invalid, or its version or payload doesn't match the
 *   definitions of subscribed events (logged as `event.invalid`): after `max_retries` it lands
 *   in the dead-letter queue for inspection.
 */
export async function consumeEventBatch(
  batch: QueueBatchLike,
  options: ConsumeOptions,
): Promise<void> {
  await Promise.all(batch.messages.map((message) => consumeMessage(message, options)))
}

async function consumeMessage(message: QueueMessageLike, options: ConsumeOptions): Promise<void> {
  const started = Date.now()
  const eventId = field(message.body, 'id')
  const eventType = field(message.body, 'type')
  const correlationId = field(field(message.body, 'metadata'), 'correlationId')
  const base = {
    messageId: message.id,
    eventId: typeof eventId === 'string' ? eventId : undefined,
    eventType: typeof eventType === 'string' ? eventType : undefined,
    correlationId: typeof correlationId === 'string' ? correlationId : undefined,
    attempt: message.attempts,
  }
  const delaySeconds = retryDelaySeconds(message.attempts)
  if (
    typeof eventType === 'string' &&
    !options.subscriptions.some(({ value }) => value.event.type === eventType)
  ) {
    // Nobody in this app subscribes to the type: nothing to deliver (e.g. events only other
    // consumers care about). Retrying would only move the message to the DLQ.
    options.logger.info('event.unrouted', { ...base, status: 'skipped' })
    message.ack()
    return
  }
  try {
    const results = await dispatchEnvelope(message.body, { ...options, attempt: message.attempts })
    const failed = results.filter((result) => result.status === 'failed')
    const status = failed.length === 0 ? 'delivered' : 'retrying'
    options.logger[failed.length === 0 ? 'info' : 'warn']('event.consumed', {
      ...base,
      status,
      subscriptions: results.length,
      failed: failed.map((result) => result.subscription),
      durationMs: Date.now() - started,
    })
    if (failed.length === 0) message.ack()
    else message.retry({ delaySeconds })
  } catch (error) {
    options.logger.error('event.invalid', {
      ...base,
      status: 'retrying',
      durationMs: Date.now() - started,
      issues: error instanceof ValidationError ? error.issues : undefined,
      error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    })
    message.retry({ delaySeconds })
  }
}

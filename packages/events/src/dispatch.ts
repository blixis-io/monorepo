import {
  type EventEnvelope,
  type EventSubscription,
  InfrastructureError,
  type Logger,
} from '@blixis/contracts'
import type { Attributed, RunInScope } from '@blixis/kernel'
import { parseEnvelope } from './envelope.ts'
import { PROCESSED_EVENTS } from './processed.ts'
import type { EventRegistry } from './registry.ts'

/** Outcome of one subscription for one envelope. */
export interface DispatchResult {
  /** `<module>#<subscription id>`, also the idempotency key prefix (006.006). */
  readonly subscription: string
  /** `skipped`: already processed by this subscription (a redelivery). */
  readonly status: 'ok' | 'skipped' | 'failed'
  readonly error?: unknown
}

/** Options for {@link dispatchEnvelope}. */
export interface DispatchOptions {
  /** All module subscriptions (the kernel's `contributions.subscriptions`). */
  readonly subscriptions: readonly Attributed<EventSubscription>[]
  readonly registry: EventRegistry
  /** Opens a fresh request scope per handler. */
  readonly runInScope: RunInScope
  readonly logger: Logger
  /** Delivery attempt, starting at 1. Default 1. */
  readonly attempt?: number
}

/** Whether `subscription` accepts `envelope` (type and payload version). */
export function matches(subscription: EventSubscription, envelope: EventEnvelope): boolean {
  if (subscription.event.type !== envelope.type) return false
  const versions = subscription.versions ?? [subscription.event.version]
  return versions.includes(envelope.version)
}

/**
 * Delivers one envelope to every matching subscription — shared by the in-process bus and the
 * queue consumer, so both paths behave the same (architecture §15, §33).
 *
 * - The raw envelope is parsed like untrusted queue input (`parseEnvelope`): shape, known
 *   type/version, payload schema.
 * - Each handler runs in its own request scope as a `system` actor acting on behalf of the
 *   original actor, with the envelope's correlation id and tenant.
 * - Deduplication (§33): with a `PROCESSED_EVENTS` store, a subscription that already
 *   processed the envelope is `skipped`; `idempotency: 'transactional'` runs the handler in the
 *   marker's transaction.
 * - Handlers run concurrently and are isolated: one failure never prevents the others; failures
 *   are logged and returned per subscription.
 *
 * @throws ValidationError when the envelope itself is invalid (no handler runs).
 */
export async function dispatchEnvelope(
  raw: unknown,
  options: DispatchOptions,
): Promise<DispatchResult[]> {
  const envelope = await parseEnvelope(raw, options.registry)
  const attempt = options.attempt ?? 1
  const targets = options.subscriptions.filter(({ value }) => matches(value, envelope))
  return Promise.all(
    targets.map(async ({ module, value }): Promise<DispatchResult> => {
      const subscription = `${module}#${value.id}`
      const onBehalfOf = envelope.metadata?.actorId
      try {
        const status = await options.runInScope(
          {
            actor: {
              type: 'system',
              component: '@blixis/events',
              ...(onBehalfOf === undefined ? {} : { onBehalfOf }),
            },
            ...(envelope.metadata?.correlationId === undefined
              ? {}
              : { correlationId: envelope.metadata.correlationId }),
            tenant: {
              ...(envelope.tenantId === undefined ? {} : { organizationId: envelope.tenantId }),
              ...(envelope.spaceId === undefined ? {} : { spaceId: envelope.spaceId }),
            },
          },
          async (context): Promise<'ok' | 'skipped'> => {
            const handlerContext = {
              attempt,
              services: context.services,
              logger: context.logger.child({
                eventId: envelope.id,
                eventType: envelope.type,
                module,
                subscription: value.id,
              }),
            }
            const processed = context.services.getOptional(PROCESSED_EVENTS)
            if ((value.idempotency ?? 'after') === 'transactional') {
              if (processed === undefined) {
                throw new InfrastructureError(
                  `${subscription} uses transactional idempotency, but no processed-events store is configured`,
                )
              }
              const ran = await processed.runOnce(subscription, envelope.id, (transaction) =>
                value.handle(envelope, { ...handlerContext, transaction }),
              )
              return ran ? 'ok' : 'skipped'
            }
            if (
              processed !== undefined &&
              (await processed.isProcessed(subscription, envelope.id))
            ) {
              return 'skipped'
            }
            await value.handle(envelope, handlerContext)
            await processed?.markProcessed(subscription, envelope.id)
            return 'ok'
          },
        )
        return { subscription, status }
      } catch (error) {
        options.logger.error('event handler failed', {
          eventId: envelope.id,
          eventType: envelope.type,
          subscription,
          attempt,
          error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        })
        return { subscription, status: 'failed', error }
      }
    }),
  )
}

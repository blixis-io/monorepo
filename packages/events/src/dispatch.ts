import type { EventEnvelope, EventSubscription, Logger } from '@blixis/contracts'
import type { Attributed, RunInScope } from '@blixis/kernel'
import { parseEnvelope } from './envelope.ts'
import type { EventRegistry } from './registry.ts'

/** Outcome of one subscription for one envelope. */
export interface DispatchResult {
  /** `<module>#<subscription id>`, also the idempotency key prefix (006.006). */
  readonly subscription: string
  readonly status: 'ok' | 'failed'
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
        await options.runInScope(
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
          (context) =>
            value.handle(envelope, {
              attempt,
              services: context.services,
              logger: context.logger.child({
                eventId: envelope.id,
                eventType: envelope.type,
                module,
                subscription: value.id,
              }),
            }),
        )
        return { subscription, status: 'ok' }
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

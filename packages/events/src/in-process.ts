import { type EventEnvelope, REQUEST_CONTEXT } from '@blixis/contracts'
import { KERNEL_CONTRIBUTIONS, RUN_IN_SCOPE } from '@blixis/kernel'
import type { EventTransport, PublishContext } from './bus.ts'
import { type DispatchOptions, type DispatchResult, dispatchEnvelope } from './dispatch.ts'
import { EVENT_REGISTRY } from './module.ts'

/**
 * - `immediate`: handlers run (and are awaited) during `emit`.
 * - `deferred`: envelopes are collected until {@link InProcessTransport.flush} — simulates
 *   delivery after commit.
 */
export type InProcessMode = 'immediate' | 'deferred'

/** An in-process {@link EventTransport} for tests and local development (architecture §36). */
export interface InProcessTransport extends EventTransport {
  /** Every envelope published, in order (also those still pending). */
  readonly published: readonly EventEnvelope[]
  /** Envelopes waiting for {@link InProcessTransport.flush} (deferred mode). */
  readonly pending: readonly EventEnvelope[]
  /**
   * Delivers pending envelopes, including events emitted by handlers during the flush, until
   * none are left. Returns the results per envelope and subscription.
   */
  flush(): Promise<{ readonly envelope: EventEnvelope; readonly results: DispatchResult[] }[]>
}

/**
 * Creates an in-process transport. Delivery uses {@link dispatchEnvelope} — the same parsing,
 * per-handler scopes, and failure isolation as the queue consumer — so tests exercise the
 * production handler path; only the transport differs.
 */
export function inProcessTransport(
  options: { readonly mode?: InProcessMode } = {},
): InProcessTransport {
  const mode = options.mode ?? 'immediate'
  const published: EventEnvelope[] = []
  const pending: { envelope: EventEnvelope; dispatch: DispatchOptions }[] = []

  // Resolved at publish time: in deferred mode the emitting request scope has usually ended
  // by the time flush() runs. RUN_IN_SCOPE opens new scopes, so it stays usable.
  const dispatchOptions = (context: PublishContext): DispatchOptions => ({
    subscriptions: context.services.get(KERNEL_CONTRIBUTIONS).subscriptions,
    registry: context.services.get(EVENT_REGISTRY),
    runInScope: context.services.get(RUN_IN_SCOPE),
    logger: context.services.get(REQUEST_CONTEXT).logger,
  })
  const deliver = (envelope: EventEnvelope, dispatch: DispatchOptions) =>
    dispatchEnvelope(JSON.parse(JSON.stringify(envelope)), dispatch)

  return {
    published,
    get pending() {
      return pending.map((entry) => entry.envelope)
    },
    async publish(envelope, context) {
      published.push(envelope)
      const dispatch = dispatchOptions(context)
      if (mode === 'deferred') {
        pending.push({ envelope, dispatch })
        return
      }
      await deliver(envelope, dispatch)
    },
    async flush() {
      const delivered: { envelope: EventEnvelope; results: DispatchResult[] }[] = []
      while (pending.length > 0) {
        const next = pending.shift()
        if (next === undefined) break
        delivered.push({
          envelope: next.envelope,
          results: await deliver(next.envelope, next.dispatch),
        })
      }
      return delivered
    },
  }
}

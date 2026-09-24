import type { BlixisModule, EventEnvelope } from '@blixis/contracts'
import {
  eventsModule,
  type InProcessMode,
  type InProcessTransport,
  inProcessTransport,
} from '@blixis/events'

/** Result of {@link captureEvents}. */
export interface CapturedEvents {
  /** Pass to `eventsModule({ transport })`, or use {@link CapturedEvents.module}. */
  readonly transport: InProcessTransport
  /** `eventsModule()` wired to this capture, for `createTestBlixis({ modules: [...] })`. */
  module(): BlixisModule
  /** Every emitted envelope, in order. */
  readonly emitted: readonly EventEnvelope[]
  /** Delivers pending events (deferred mode), including events emitted by handlers. */
  flush: InProcessTransport['flush']
  /**
   * Returns the first emitted envelope of `type` matching `predicate`.
   * @throws Error listing what was emitted when none matches.
   */
  expectEvent<TPayload = unknown>(
    type: string,
    predicate?: (envelope: EventEnvelope<string, TPayload>) => boolean,
  ): EventEnvelope<string, TPayload>
}

/**
 * Captures events for assertions and delivers them to subscribers in-process, through the same
 * dispatch path as the queue consumer (architecture §36).
 *
 * @example
 * const events = captureEvents({ mode: 'deferred' })
 * const t = await createTestBlixis({ modules: [events.module(), content(), search()] })
 * await t.request('/api/v1/entries', { method: 'POST', json: { title: 'x' } })
 * events.expectEvent('entry.created', (e) => e.payload.title === 'x')
 * await events.flush()          // deliver to subscribers, as after commit
 */
export function captureEvents(options: { readonly mode?: InProcessMode } = {}): CapturedEvents {
  const transport = inProcessTransport(options)
  return {
    transport,
    module: () => eventsModule({ transport }),
    get emitted() {
      return transport.published
    },
    flush: () => transport.flush(),
    expectEvent<TPayload>(
      type: string,
      predicate?: (envelope: EventEnvelope<string, TPayload>) => boolean,
    ) {
      const candidates = transport.published.filter((e) => e.type === type) as EventEnvelope<
        string,
        TPayload
      >[]
      const found = predicate === undefined ? candidates[0] : candidates.find(predicate)
      if (found === undefined) {
        const seen = transport.published.map((e) => `${e.type}@${e.version}`).join(', ') || 'none'
        throw new Error(
          `Expected a ${type} event${predicate === undefined ? '' : ' matching the predicate'}; emitted: ${seen}`,
        )
      }
      return found
    },
  }
}

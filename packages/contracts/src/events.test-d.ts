import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import {
  defineEvent,
  type EventBus,
  type EventEnvelope,
  type EventPayload,
  subscribe,
} from './events.ts'

const entryPublished = defineEvent({
  type: 'entry.published',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ entryId: z.string(), spaceId: z.string() }),
})

declare const bus: EventBus

test('payload type is inferred from the schema', () => {
  expectTypeOf<EventPayload<typeof entryPublished>>().toEqualTypeOf<{
    entryId: string
    spaceId: string
  }>()
  expectTypeOf(entryPublished.type).toEqualTypeOf<'entry.published'>()
})

test('emit rejects wrong payloads', () => {
  void bus.emit(entryPublished, { entryId: 'e', spaceId: 's' })
  // @ts-expect-error missing spaceId
  void bus.emit(entryPublished, { entryId: 'e' })
  // @ts-expect-error wrong field type
  void bus.emit(entryPublished, { entryId: 1, spaceId: 's' })
})

test('subscriptions receive typed envelopes', () => {
  subscribe(entryPublished, 'h', async (envelope) => {
    expectTypeOf(envelope).toEqualTypeOf<
      EventEnvelope<'entry.published', { entryId: string; spaceId: string }>
    >()
  })
})

test('event type must be dotted', () => {
  // @ts-expect-error not "<aggregate>.<verb>"
  defineEvent({ type: 'published', version: 1, delivery: 'best-effort', schema: z.object({}) })
})

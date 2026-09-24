import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineEvent, type EventEnvelope, subscribe } from './events.ts'

z.config({ jitless: true })

const entryPublished = defineEvent({
  type: 'entry.published',
  version: 1,
  delivery: 'transactional',
  description: 'An entry version was published.',
  schema: z.object({ entryId: z.string(), spaceId: z.string(), versionId: z.string() }),
})

describe('defineEvent', () => {
  it('preserves the definition and freezes it', () => {
    expect(entryPublished).toMatchObject({
      type: 'entry.published',
      version: 1,
      delivery: 'transactional',
      description: 'An entry version was published.',
    })
    expect(Object.isFrozen(entryPublished)).toBe(true)
  })

  it('accepts dotted sub-aggregates', () => {
    expect(() =>
      defineEvent({
        type: 'webhook.delivery.failed',
        version: 2,
        delivery: 'best-effort',
        schema: z.object({}),
      }),
    ).not.toThrow()
  })

  it('rejects invalid names and versions', () => {
    const schema = z.object({})
    expect(() =>
      defineEvent({ type: 'Entry.Published', version: 1, delivery: 'best-effort', schema }),
    ).toThrowError(TypeError)
    expect(() =>
      defineEvent({ type: 'entry.published', version: 0, delivery: 'best-effort', schema }),
    ).toThrowError(/version/)
  })
})

describe('EventEnvelope', () => {
  it('is JSON-serialisable without loss', () => {
    const envelope: EventEnvelope<'entry.published', { entryId: string }> = {
      id: '0192f0c8-8a4e-7b1a-9c3d-4e5f6a7b8c9d',
      type: 'entry.published',
      version: 1,
      timestamp: new Date(0).toISOString(),
      spaceId: 'spc_1',
      payload: { entryId: 'ent_1' },
      metadata: { correlationId: 'req_1', actorId: 'usr_1', source: '@blixis/content' },
    }
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope)
  })
})

describe('subscribe', () => {
  it('creates a subscription with optional versions', async () => {
    const seen: string[] = []
    const sub = subscribe(entryPublished, 'invalidate-cache', async (envelope) => {
      seen.push(envelope.payload.entryId)
    })
    expect(sub).toMatchObject({ id: 'invalidate-cache', event: entryPublished })
    expect(sub).not.toHaveProperty('versions')
    await sub.handle(
      {
        id: 'e1',
        type: 'entry.published',
        version: 1,
        timestamp: '1970-01-01T00:00:00.000Z',
        payload: { entryId: 'ent_1', spaceId: 's', versionId: 'v' },
      },
      {
        attempt: 1,
        services: { get: () => undefined as never, getOptional: () => undefined, has: () => false },
      },
    )
    expect(seen).toEqual(['ent_1'])
    expect(subscribe(entryPublished, 'x', async () => {}, { versions: [1, 2] }).versions).toEqual([
      1, 2,
    ])
  })
})

import { defineEvent, ValidationError } from '@blixis/contracts'
import { idTimestamp } from '@blixis/shared'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { actorIdOf, createEnvelope, parseEnvelope } from './envelope.ts'
import { assertJsonValue } from './json.ts'
import { EventRegistry } from './registry.ts'

z.config({ jitless: true })
const created = defineEvent({
  type: 'space.created',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ spaceId: z.string(), name: z.string().min(1) }),
})
const context = {
  tenant: { organizationId: 'org-1', spaceId: 'space-1' },
  correlationId: 'corr-1',
  actor: { type: 'user', userId: 'u1' } as const,
  now: () => new Date('2026-09-24T12:00:00.000Z'),
}

describe('createEnvelope', () => {
  it('builds a validated envelope with UUIDv7 id, tenant, and tracing metadata', async () => {
    const envelope = await createEnvelope(created, { spaceId: 's', name: 'Blog' }, context, {
      source: '@acme/spaces',
    })
    expect(envelope).toMatchObject({
      type: 'space.created',
      version: 1,
      timestamp: '2026-09-24T12:00:00.000Z',
      tenantId: 'org-1',
      spaceId: 'space-1',
      payload: { spaceId: 's', name: 'Blog' },
      metadata: { correlationId: 'corr-1', actorId: 'user:u1', source: '@acme/spaces' },
    })
    expect(idTimestamp(envelope.id)).toBeInstanceOf(Date)
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope)
  })

  it('lets emit options override tenant ids and omits anonymous actors', async () => {
    const envelope = await createEnvelope(
      created,
      { spaceId: 's', name: 'x' },
      { ...context, actor: { type: 'anonymous' } },
      { spaceId: 'space-2', tenantId: 'org-2' },
    )
    expect(envelope).toMatchObject({ tenantId: 'org-2', spaceId: 'space-2' })
    expect(envelope.metadata).toEqual({ correlationId: 'corr-1' })
  })

  it('rejects invalid payloads with ValidationError', async () => {
    await expect(
      createEnvelope(created, { spaceId: 's', name: '' }, context),
    ).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('assertJsonValue', () => {
  it.each<[unknown, string]>([
    [{ at: new Date() }, 'Date'],
    [{ f: () => 1 }, 'function'],
    [{ n: Number.NaN }, 'NaN'],
    [{ big: 1n }, 'bigint'],
    [{ u: undefined }, 'undefined'],
    [[1, undefined], 'undefined'],
    [new Map(), 'Map'],
  ])('rejects %o (%s)', (value, _kind) => {
    expect(() => assertJsonValue(value)).toThrow(ValidationError)
  })

  it('rejects cycles and accepts plain JSON', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic
    const error = (() => {
      try {
        assertJsonValue(cyclic)
      } catch (e) {
        return e as ValidationError
      }
      return undefined
    })()
    expect(error?.issues).toEqual([
      { path: ['self'], message: 'a circular reference is not allowed in event payloads' },
    ])
    const shared = { a: 1 }
    expect(() =>
      assertJsonValue({ x: shared, y: [shared, null, 'z', true, 1.5], n: Object.create(null) }),
    ).not.toThrow()
  })
})

describe('parseEnvelope', () => {
  const registry = new EventRegistry()
  registry.register(created, '@acme/spaces')

  it('round-trips an envelope received as JSON and strips unknown metadata', async () => {
    const envelope = await createEnvelope(created, { spaceId: 's', name: 'Blog' }, context)
    const raw = JSON.parse(
      JSON.stringify({ ...envelope, extra: 1, metadata: { ...envelope.metadata, evil: 1 } }),
    )
    const parsed = await parseEnvelope(raw, registry)
    expect(parsed).toEqual(envelope)
  })

  it('rejects malformed envelopes, unknown events, and invalid payloads', async () => {
    const error = await parseEnvelope(
      { id: 'x', type: 1, version: 'a', timestamp: 'yesterday' },
      registry,
    ).catch((e) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).issues.map((i) => i.path[0])).toEqual([
      'id',
      'type',
      'version',
      'timestamp',
    ])
    const valid = await createEnvelope(created, { spaceId: 's', name: 'Blog' }, context)
    await expect(parseEnvelope({ ...valid, version: 9 }, registry)).rejects.toThrow(/Unknown event/)
    await expect(parseEnvelope({ ...valid, payload: { spaceId: 1 } }, registry)).rejects.toThrow(
      /Invalid payload/,
    )
    await expect(parseEnvelope('nope', registry)).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('actorIdOf', () => {
  it('builds stable actor references', () => {
    expect(actorIdOf({ type: 'system', component: '@blixis/events.outbox' })).toBe(
      'system:@blixis/events.outbox',
    )
    expect(actorIdOf({ type: 'apiToken', tokenId: 't', ownerId: 'u', scopes: [] })).toBe(
      'apiToken:t',
    )
  })
})

import {
  defineEvent,
  EVENT_BUS,
  type EventEnvelope,
  type EventHandlerContext,
  REQUEST_CONTEXT,
  subscribe,
  ValidationError,
} from '@blixis/contracts'
import { createBlixis, createJsonLogger, defineModule } from '@blixis/kernel'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { inProcessTransport } from './in-process.ts'
import { eventsModule } from './module.ts'

z.config({ jitless: true })
const created = defineEvent({
  type: 'note.created',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ noteId: z.string() }),
})
const createdV2 = defineEvent({
  type: 'note.created',
  version: 2,
  delivery: 'best-effort',
  schema: z.object({ noteId: z.string(), title: z.string() }),
})
const indexed = defineEvent({
  type: 'note.indexed',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ noteId: z.string() }),
})

interface Seen {
  handler: string
  envelope: EventEnvelope
  context: EventHandlerContext
  actor: unknown
  correlationId: string
  spaceId: string | undefined
}

function setup(mode: 'immediate' | 'deferred' = 'immediate', failing = false) {
  const seen: Seen[] = []
  const lines: string[] = []
  const record =
    (handler: string) => async (envelope: EventEnvelope, context: EventHandlerContext) => {
      const request = context.services.get(REQUEST_CONTEXT)
      seen.push({
        handler,
        envelope,
        context,
        actor: request.actor,
        correlationId: request.correlationId,
        spaceId: request.tenant.spaceId,
      })
    }
  const search = defineModule({
    meta: { name: '@acme/search', version: '1.0.0' },
    events: [
      subscribe(created, 'index-note', async (envelope, context) => {
        await record('search#index-note')(envelope, context)
        if (failing) throw new Error('index down')
        await context.services.get(EVENT_BUS).emit(indexed, { noteId: envelope.payload.noteId })
      }),
    ],
  })
  const audit = defineModule({
    meta: { name: '@acme/audit', version: '1.0.0' },
    events: [
      subscribe(created, 'log-note', record('audit#log-note'), { versions: [1, 2] }),
      subscribe(indexed, 'log-indexed', record('audit#log-indexed')),
    ],
  })
  const transport = inProcessTransport({ mode })
  const app = createBlixis({
    modules: [eventsModule({ transport }), search(), audit()],
    logger: createJsonLogger({ write: (_level, line) => void lines.push(line) }),
  })
  const emit = (event: typeof created | typeof createdV2, payload: never) =>
    app.runInScope(
      {
        correlationId: 'corr-1',
        actor: { type: 'user', userId: 'u1' },
        tenant: { organizationId: 'o', spaceId: 's' },
      },
      async ({ services }) => services.get(EVENT_BUS).emit(event, payload),
    )
  return { app, seen, lines, transport, emit }
}

describe('dispatchEnvelope (in-process, immediate)', () => {
  it('runs each matching handler in its own system scope with the original trace and tenant', async () => {
    const { seen, emit } = setup()
    await emit(created, { noteId: 'n1' } as never)
    const handlers = seen.map((s) => s.handler).sort()
    expect(handlers).toEqual(['audit#log-indexed', 'audit#log-note', 'search#index-note'])
    const first = seen.find((s) => s.handler === 'search#index-note')
    expect(first?.actor).toEqual({
      type: 'system',
      component: '@blixis/events',
      onBehalfOf: 'user:u1',
    })
    expect(first?.correlationId).toBe('corr-1')
    expect(first?.spaceId).toBe('s')
    expect(first?.context.attempt).toBe(1)
    const scopes = new Set(seen.map((s) => s.context.services))
    expect(scopes.size).toBe(seen.length)
  })

  it('delivers by payload version: v2 only reaches subscribers that accept it', async () => {
    const { seen, emit } = setup()
    await emit(createdV2, { noteId: 'n2', title: 't' } as never)
    expect(seen.map((s) => s.handler)).toEqual(['audit#log-note'])
  })

  it('isolates handler failures and logs them', async () => {
    const { seen, lines, emit } = setup('immediate', true)
    await emit(created, { noteId: 'n3' } as never)
    expect(seen.map((s) => s.handler).sort()).toEqual(['audit#log-note', 'search#index-note'])
    expect(lines.join('\n')).toMatch(/event handler failed.*@acme\/search#index-note.*index down/)
  })
})

describe('in-process transport (deferred)', () => {
  it('collects until flush, then delivers — including events emitted by handlers', async () => {
    const { seen, transport, emit } = setup('deferred')
    await emit(created, { noteId: 'n4' } as never)
    expect(seen).toEqual([])
    expect(transport.pending.map((e) => e.type)).toEqual(['note.created'])
    const delivered = await transport.flush()
    expect(delivered.map((d) => d.envelope.type)).toEqual(['note.created', 'note.indexed'])
    expect(delivered[0]?.results.map((r) => r.status)).toEqual(['ok', 'ok'])
    expect(seen.map((s) => s.handler).sort()).toEqual([
      'audit#log-indexed',
      'audit#log-note',
      'search#index-note',
    ])
    expect(transport.pending).toEqual([])
  })
})

describe('dispatchEnvelope with invalid input', () => {
  it('rejects envelopes that fail parsing before any handler runs', async () => {
    const { app } = setup()
    const { dispatchEnvelope } = await import('./dispatch.ts')
    const { EVENT_REGISTRY } = await import('./module.ts')
    const { KERNEL_CONTRIBUTIONS, RUN_IN_SCOPE } = await import('@blixis/kernel')
    await app.runInScope({}, async ({ services, logger }) => {
      await expect(
        dispatchEnvelope(
          { id: 'nope', type: 'note.created', version: 1, timestamp: 'x', payload: {} },
          {
            subscriptions: services.get(KERNEL_CONTRIBUTIONS).subscriptions,
            registry: services.get(EVENT_REGISTRY),
            runInScope: services.get(RUN_IN_SCOPE),
            logger,
          },
        ),
      ).rejects.toBeInstanceOf(ValidationError)
    })
  })
})

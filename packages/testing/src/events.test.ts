import { defineEvent, EVENT_BUS, type ModuleHonoEnv, subscribe } from '@blixis/contracts'
import { defineModule } from '@blixis/kernel'
import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createTestBlixis } from './create-test-blixis.ts'
import { captureEvents } from './events.ts'

z.config({ jitless: true })
const pinged = defineEvent({
  type: 'probe.pinged',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ n: z.number() }),
})

describe('captureEvents', () => {
  const received: number[] = []
  const probe = defineModule({
    meta: { name: '@test/probe', version: '1.0.0' },
    events: [subscribe(pinged, 'count', async (e) => void received.push(e.payload.n))],
    rest: {
      path: '/ping',
      app: new Hono<ModuleHonoEnv>().post('/:n', async (c) => {
        await c.var.services.get(EVENT_BUS).emit(pinged, { n: Number(c.req.param('n')) })
        return c.body(null, 204)
      }),
    },
  })

  it('captures emitted events for assertions and delivers them on flush (deferred)', async () => {
    received.length = 0
    const events = captureEvents({ mode: 'deferred' })
    const t = await createTestBlixis({ modules: [events.module(), probe()] })
    expect((await t.request('/api/v1/ping/7', { method: 'POST' })).status).toBe(204)
    expect(
      events.expectEvent<{ n: number }>('probe.pinged', (e) => e.payload.n === 7).metadata
        ?.correlationId,
    ).toBeDefined()
    expect(received).toEqual([])
    await events.flush()
    expect(received).toEqual([7])
  })

  it('explains what was emitted when an expectation fails', async () => {
    const events = captureEvents()
    const t = await createTestBlixis({ modules: [events.module(), probe()] })
    await t.request('/api/v1/ping/1', { method: 'POST' })
    expect(() => events.expectEvent('entry.created')).toThrowError(
      'Expected a entry.created event; emitted: probe.pinged@1',
    )
  })
})

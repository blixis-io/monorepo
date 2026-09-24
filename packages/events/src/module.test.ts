import {
  defineEvent,
  EVENT_BUS,
  type EventEnvelope,
  InfrastructureError,
  type TransactionScope,
} from '@blixis/contracts'
import { createBlixis, noopLogger } from '@blixis/kernel'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import type { EventTransport } from './bus.ts'
import { eventsModule } from './module.ts'

z.config({ jitless: true })
const pinged = defineEvent({
  type: 'probe.pinged',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ n: z.number() }),
})
const saved = defineEvent({
  type: 'probe.saved',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ n: z.number() }),
})

function recording() {
  const sent: EventEnvelope[] = []
  const transport: EventTransport = { publish: async (envelope) => void sent.push(envelope) }
  return { sent, transport }
}

describe('EVENT_BUS', () => {
  it('emits envelopes carrying the request context of the scope', async () => {
    const { sent, transport } = recording()
    const app = createBlixis({ modules: [eventsModule({ transport })], logger: noopLogger })
    await app.runInScope(
      {
        correlationId: 'corr-9',
        tenant: { organizationId: 'o', spaceId: 's' },
        actor: { type: 'user', userId: 'u' },
      },
      async ({ services }) => services.get(EVENT_BUS).emit(pinged, { n: 1 }),
    )
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      type: 'probe.pinged',
      spaceId: 's',
      tenantId: 'o',
      payload: { n: 1 },
      metadata: { correlationId: 'corr-9', actorId: 'user:u' },
    })
  })

  it('requires a transaction for transactional events', async () => {
    const { sent, transport } = recording()
    const app = createBlixis({ modules: [eventsModule({ transport })], logger: noopLogger })
    await expect(
      app.runInScope({}, async ({ services }) => services.get(EVENT_BUS).emit(saved, { n: 1 })),
    ).rejects.toThrow(/transactional event: pass \{ transaction \}/)
    await app.runInScope({}, async ({ services }) =>
      services.get(EVENT_BUS).emit(saved, { n: 2 }, { transaction: {} as TransactionScope }),
    )
    expect(sent.map((e) => e.payload)).toEqual([{ n: 2 }])
  })

  it('fails loudly without a transport', async () => {
    const app = createBlixis({ modules: [eventsModule()], logger: noopLogger })
    await expect(
      app.runInScope({}, async ({ services }) => services.get(EVENT_BUS).emit(pinged, { n: 1 })),
    ).rejects.toBeInstanceOf(InfrastructureError)
  })
})

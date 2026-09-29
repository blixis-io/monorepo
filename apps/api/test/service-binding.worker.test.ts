import { env } from 'cloudflare:test'
import { createServiceBindingProxy, type ServiceBindingLike } from '@blixis-io/cloudflare'
import { createServiceToken, ValidationError } from '@blixis-io/contracts'
import { describe, expect, it } from 'vitest'

// Real Workers RPC (plan 020.005): the NOTES binding points at the auxiliary Worker in
// test/fixtures/notes-service.worker.ts (built and wired in vitest.config.ts).
interface NotesService {
  whoAmI(): Promise<{ actor: string; correlationId: string; spaceId?: string }>
  fail(): Promise<never>
}
const NOTES = createServiceToken<NotesService>('@acme/notes.service')

describe('Service Binding adapter over Workers RPC', () => {
  const binding = (env as unknown as { NOTES: ServiceBindingLike }).NOTES
  const notes = createServiceBindingProxy(binding, NOTES, () => ({
    correlationId: 'corr-rpc',
    actor: { type: 'user', userId: 'u1' },
    tenant: { organizationId: 'o1', spaceId: 's1' },
  }))

  it('runs the call in the serving Worker with the caller context', async () => {
    expect(await notes.whoAmI()).toEqual({ actor: 'u1', correlationId: 'corr-rpc', spaceId: 's1' })
  })

  it('rebuilds public errors across the boundary', async () => {
    const error = await notes.fail().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).issues).toEqual([{ path: ['title'], message: 'Required' }])
  })
})

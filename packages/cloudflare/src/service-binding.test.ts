import {
  createServiceToken,
  InfrastructureError,
  NotFoundError,
  REQUEST_CONTEXT,
  ValidationError,
} from '@blixis-io/contracts'
import { createBlixis, defineModule, noopLogger } from '@blixis-io/kernel'
import { describe, expect, it } from 'vitest'
import {
  createServiceBindingProxy,
  handleServiceCall,
  type ServiceBindingLike,
  type ServiceCall,
  serviceBindingModule,
} from './service-binding.ts'

interface NotesService {
  whoAmI(): Promise<{ actor: string; correlationId: string; spaceId?: string }>
  echo(value: unknown): Promise<unknown>
  fail(kind: 'validation' | 'crash'): Promise<never>
}
const NOTES = createServiceToken<NotesService>('@acme/notes.service')

const notesModule = defineModule({
  meta: { name: '@acme/notes', version: '1.0.0' },
  setup(ctx) {
    ctx.services.provideFactory(
      NOTES,
      ({ services }) => ({
        async whoAmI() {
          const request = services.get(REQUEST_CONTEXT)
          return {
            actor: request.actor.type === 'user' ? request.actor.userId : request.actor.type,
            correlationId: request.correlationId,
            ...(request.tenant.spaceId === undefined ? {} : { spaceId: request.tenant.spaceId }),
          }
        },
        async echo(value) {
          return value
        },
        async fail(kind) {
          if (kind === 'validation')
            throw new ValidationError('Bad note', [{ path: ['title'], message: 'Required' }])
          throw new Error('database password=hunter2 exploded')
        },
      }),
      { scope: 'request' },
    )
  },
})

/** The serving Worker, reached through a fake binding that clones like RPC. */
const server = createBlixis({ modules: [notesModule()], logger: noopLogger })
const binding: ServiceBindingLike = {
  call: async (call: ServiceCall) =>
    structuredClone(await handleServiceCall(server, NOTES, structuredClone(call))),
}
const context = {
  correlationId: 'corr-remote',
  actor: { type: 'user', userId: 'u1' } as const,
  tenant: { organizationId: 'o1', spaceId: 's1' },
}

describe('service binding proxy', () => {
  const notes = createServiceBindingProxy(binding, NOTES, () => context)

  it('calls the remote service with the caller context', async () => {
    expect(await notes.whoAmI()).toEqual({
      actor: 'u1',
      correlationId: 'corr-remote',
      spaceId: 's1',
    })
  })

  it('returns exactly what an in-process call returns', async () => {
    const value = { at: new Date(0), nested: { list: [1, 'two', null] }, map: new Map([['k', 1]]) }
    const local = await server.runInScope(
      { actor: context.actor, correlationId: context.correlationId, tenant: context.tenant },
      async ({ services }) => ({
        who: await services.get(NOTES).whoAmI(),
        echo: await services.get(NOTES).echo(value),
      }),
    )
    expect({ who: await notes.whoAmI(), echo: await notes.echo(value) }).toEqual(local)
  })

  it('passes structured-clone data both ways', async () => {
    const value = { at: new Date('2026-09-29T00:00:00Z'), tags: new Set(['a']), n: [1, 2] }
    expect(await notes.echo(value)).toEqual(value)
  })

  it('rebuilds public errors and hides unexpected ones', async () => {
    const validation = await notes.fail('validation').catch((error: unknown) => error)
    expect(validation).toBeInstanceOf(ValidationError)
    expect((validation as ValidationError).issues).toEqual([
      { path: ['title'], message: 'Required' },
    ])
    const crash = await notes.fail('crash').catch((error: unknown) => error)
    expect(crash).toBeInstanceOf(InfrastructureError)
    expect(JSON.stringify(crash)).not.toContain('hunter2')
    expect((crash as Error).message).not.toContain('hunter2')
  })

  it('refuses unknown methods, Object members, and other services', async () => {
    const loose = notes as unknown as Record<string, () => Promise<unknown>>
    await expect(loose['nope']?.()).rejects.toBeInstanceOf(NotFoundError)
    expect(loose['toString']).toBeUndefined()
    expect((notes as unknown as { then?: unknown }).then).toBeUndefined()
    const other = createServiceBindingProxy(
      binding,
      createServiceToken<NotesService>('@acme/other.service'),
      () => context,
    )
    await expect(other.whoAmI()).rejects.toBeInstanceOf(NotFoundError)
  })

  it('turns transport failures into InfrastructureError', async () => {
    const broken = createServiceBindingProxy(
      { call: () => Promise.reject(new Error('binding gone')) },
      NOTES,
      () => context,
    )
    await expect(broken.whoAmI()).rejects.toBeInstanceOf(InfrastructureError)
  })
})

describe('serviceBindingModule', () => {
  it('provides the token in the calling Worker from the binding, with the request context', async () => {
    const app = createBlixis({
      modules: [
        serviceBindingModule({ name: '@acme/notes.remote', token: NOTES, binding: 'NOTES' }),
      ],
      logger: noopLogger,
    })
    const result = await app.runInScope(
      {
        actor: { type: 'user', userId: 'u2' },
        correlationId: 'corr-caller',
        tenant: { organizationId: 'o1', spaceId: 's9' },
        bindings: { NOTES: binding },
      },
      async ({ services }) => services.get(NOTES).whoAmI(),
    )
    expect(result).toEqual({ actor: 'u2', correlationId: 'corr-caller', spaceId: 's9' })
  })

  it('fails clearly when the binding is missing', async () => {
    const app = createBlixis({
      modules: [
        serviceBindingModule({ name: '@acme/notes.remote', token: NOTES, binding: 'NOTES' }),
      ],
      logger: noopLogger,
    })
    await expect(
      app.runInScope({ bindings: {} }, async ({ services }) => services.get(NOTES)),
    ).rejects.toThrow(/NOTES is not configured/)
  })
})

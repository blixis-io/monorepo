// End-to-end proof of the kernel with fixture modules (architectural checkpoint CP1).
import type { BlixisModule } from '@blixis/contracts'
import { defineModule, ModuleValidationError } from '@blixis/kernel'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { asAnonymous, asUser, createTestBlixis, serviceOverride } from '../src/index.ts'
import { external } from './fixtures/external.ts'
import { GREETING_SERVICE, greeting } from './fixtures/greeting.ts'

z.config({ jitless: true })

describe('kernel end to end', () => {
  it('boots an external-style module that consumes a service through a capability', async () => {
    const t = await createTestBlixis({
      modules: [external(), greeting({ salutation: 'Hi' })],
      actor: asUser('u1'),
    })
    const res = await t.request('/api/v1/external/greet/Ada')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ text: 'Hi, Ada!' })
    expect(t.app.modules.map((m) => m.name)).toEqual(['@fixture/greeting', '@acme/blixis-external'])
    expect(t.app.contributions.permissions.map((p) => p.value.id)).toEqual(['external.greet'])
  })

  it('maps errors thrown by module routes and lets tests pick the actor per request', async () => {
    const t = await createTestBlixis({ modules: [greeting({}), external()], actor: asUser('u1') })
    const anonymous = await t.request('/api/v1/external/greet/Ada', { actor: asAnonymous() })
    expect(anonymous.status).toBe(401)
    expect(await anonymous.json()).toMatchObject({
      code: 'UNAUTHORIZED',
      detail: 'Sign in to be greeted',
    })
  })

  it('replaces services with overrides', async () => {
    const t = await createTestBlixis({
      modules: [greeting({}), external()],
      actor: asUser('u1'),
      overrides: [serviceOverride(GREETING_SERVICE, { greet: () => 'fake' })],
    })
    expect(await (await t.request('/api/v1/external/greet/x')).json()).toEqual({ text: 'fake' })
    expect(t.services.get(GREETING_SERVICE).greet('y')).toBe('fake')
  })

  it('captures logs with module and request fields', async () => {
    const t = await createTestBlixis({ modules: [greeting({}), external()], actor: asUser('u1') })
    await t.request('/api/v1/external/greet/x', { headers: { 'x-correlation-id': 'corr-7' } })
    expect(t.logs.entries).toContainEqual(
      expect.objectContaining({
        message: 'greeting ready',
        fields: expect.objectContaining({ module: '@fixture/greeting' }),
      }),
    )
    expect(t.logs.entries).toContainEqual(
      expect.objectContaining({
        message: 'greeted',
        fields: expect.objectContaining({ correlationId: 'corr-7', actorType: 'user' }),
      }),
    )
  })

  it('validates external module configuration', async () => {
    const bad = external({ excited: 'yes' as never })
    await expect(createTestBlixis({ modules: [greeting({}), bad] })).rejects.toThrowError(
      /\[@acme\/blixis-external\] invalid configuration at config\.excited/,
    )
  })
})

describe('§26 failures name the offending module', () => {
  const failing: [string, () => readonly BlixisModule[], RegExp][] = [
    [
      'missing capability',
      () => [external()],
      /\[@acme\/blixis-external\] requires capability fixture\.greeting/,
    ],
    [
      'duplicate module',
      () => [greeting({}), greeting({})],
      /\[@fixture\/greeting\] is registered more than once/,
    ],
    [
      'incompatible version',
      () => [
        greeting({}),
        defineModule({
          meta: {
            name: '@acme/needs-v2',
            version: '1.0.0',
            requires: { '@fixture/greeting': '^2.0.0' },
          },
        })(),
      ],
      /\[@acme\/needs-v2\] requires @fixture\/greeting@\^2\.0\.0, but 1\.2\.0 is registered/,
    ],
    [
      'duplicate service provider',
      () => [
        greeting({}),
        defineModule({
          meta: { name: '@acme/second-greeting', version: '1.0.0' },
          setup: (ctx) => ctx.services.provide(GREETING_SERVICE, { greet: () => '' }),
        })(),
      ],
      /\[@acme\/second-greeting\] service @fixture\/greeting\.service is already provided by @fixture\/greeting/,
    ],
  ]

  it.each(failing)('%s', async (_name, modules, message) => {
    const error = await createTestBlixis({ modules: modules() }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toMatch(message)
    if (!(error instanceof ModuleValidationError))
      expect((error as { code?: string }).code).toBe('MODULE_ERROR')
  })
})

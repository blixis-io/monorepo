import { defineEvent, EVENT_BUS, type ModuleHonoEnv, REQUEST_CONTEXT } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { defineModule } from '@blixis/kernel'
import { newId } from '@blixis/shared'
import { asAnonymous, asApiToken, asUser, captureEvents, createTestBlixis } from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { Hono } from 'hono'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { spaceScoped, spacesModule, TENANCY_SERVICE, TENANT_RESOLVER } from '../src/index.ts'

z.config({ jitless: true })
const probed = defineEvent({
  type: 'probe.touched',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({}),
})

/** A module like any content module: space-scoped routes that trust ctx.tenant. */
const probe = defineModule({
  meta: { name: '@test/probe', version: '1.0.0' },
  rest: {
    path: '/probe',
    app: new Hono<ModuleHonoEnv>()
      .get('/spaces/:spaceId/tenant', spaceScoped(), async (c) => {
        // Services resolved after binding see the tenant too (event envelopes, loggers, …).
        await c.var.services.get(EVENT_BUS).emit(probed, {})
        return c.json({
          context: c.var.requestContext.tenant,
          service: c.var.services.get(REQUEST_CONTEXT).tenant,
        })
      })
      .get('/spaces/:spaceId/environments/:environment/tenant', spaceScoped(), (c) =>
        c.json(c.var.requestContext.tenant),
      ),
  },
})

describe.skipIf(!databaseTestsEnabled())('tenant resolution (Postgres)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({
      modules: [databaseModule(), eventsModule(), usersModule(), spacesModule()],
    })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const events = captureEvents()
    const t = await createTestBlixis({
      modules: [databaseModule(), events.module(), usersModule(), spacesModule(), probe()],
      database: db,
    })
    const user = async (email: string) =>
      (
        await t.app.runInScope({}, async ({ services }) =>
          services.get(USER_SERVICE).create({ email, displayName: email }),
        )
      ).id
    const owner = await user('owner@example.com')
    const stranger = await user('stranger@example.com')
    const { space, org } = await t.app.runInScope({}, async ({ services }) => {
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Acme', slug: 'acme' })
      const space = await tenancy.createSpace(owner, org.id, { name: 'Blog', slug: 'blog' })
      return { org, space }
    })
    return { t, events, owner, stranger, space, org }
  }

  it('binds the verified tenant to the context and to services resolved afterwards', async () => {
    const { t, events, owner, space, org } = await setup()
    const res = await t.request(`/api/v1/probe/spaces/${space.id}/tenant`, { actor: asUser(owner) })
    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      context: Record<string, string>
      service: Record<string, string>
    }
    const environmentId = space.environments[0]?.id
    expect(body.context).toEqual({ organizationId: org.id, spaceId: space.id, environmentId })
    expect(body.service).toEqual(body.context)
    expect(events.expectEvent('probe.touched')).toMatchObject({
      tenantId: org.id,
      spaceId: space.id,
    })
  })

  it('selects environments by path or query, and 404s unknown ones', async () => {
    const { t, owner, space } = await setup()
    const byPath = await t.request(`/api/v1/probe/spaces/${space.id}/environments/main/tenant`, {
      actor: asUser(owner),
    })
    expect(((await byPath.json()) as { environmentId: string }).environmentId).toBe(
      space.environments[0]?.id,
    )
    expect(
      (
        await t.request(`/api/v1/probe/spaces/${space.id}/tenant?environment=main`, {
          actor: asUser(owner),
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await t.request(`/api/v1/probe/spaces/${space.id}/environments/preview/tenant`, {
          actor: asUser(owner),
        })
      ).status,
    ).toBe(404)
  })

  it('rejects strangers, unknown and malformed ids (404) and anonymous callers (401)', async () => {
    const { t, stranger, owner, space } = await setup()
    expect(
      (await t.request(`/api/v1/probe/spaces/${space.id}/tenant`, { actor: asUser(stranger) }))
        .status,
    ).toBe(404)
    expect(
      (await t.request(`/api/v1/probe/spaces/${newId()}/tenant`, { actor: asUser(owner) })).status,
    ).toBe(404)
    expect(
      (await t.request('/api/v1/probe/spaces/not-a-uuid/tenant', { actor: asUser(owner) })).status,
    ).toBe(404)
    expect(
      (await t.request(`/api/v1/probe/spaces/${space.id}/tenant`, { actor: asAnonymous() })).status,
    ).toBe(401)
  })

  it("API tokens act with their owner's memberships; system actors are trusted but need a real space", async () => {
    const { t, owner, stranger, space } = await setup()
    expect(
      (await t.request(`/api/v1/probe/spaces/${space.id}/tenant`, { actor: asApiToken(owner) }))
        .status,
    ).toBe(200)
    expect(
      (await t.request(`/api/v1/probe/spaces/${space.id}/tenant`, { actor: asApiToken(stranger) }))
        .status,
    ).toBe(404)
    const system = { type: 'system', component: 'test' } as const
    await t.app.runInScope({ actor: system }, async ({ services }) => {
      const resolver = services.get(TENANT_RESOLVER)
      expect((await resolver.resolveSpace(system, space.id)).spaceId).toBe(space.id)
      await expect(resolver.resolveSpace(system, newId())).rejects.toThrow('Space not found')
      // Memoised per request scope.
      expect(resolver.resolveSpace(system, space.id)).toBe(resolver.resolveSpace(system, space.id))
    })
  })
})

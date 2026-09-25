import type { ModuleHonoEnv } from '@blixis/contracts'
import { requireTenant } from '@blixis/database'
import { ENVIRONMENT_SERVICE, spaceScoped } from '@blixis/spaces'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { DELIVERY_KEY_SERVICE } from '../application/delivery-keys.ts'

type Ctx = Context<ModuleHonoEnv>
const tenantOf = (c: Ctx) => {
  const { organizationId, spaceId, environmentId } = requireTenant(
    c.var.requestContext,
    'organizationId',
    'spaceId',
    'environmentId',
  )
  return { organizationId, spaceId, environmentId }
}

/** `/api/v1/spaces/:spaceId/delivery-keys[/:keyId]` (plan 012.004). */
export const deliveryKeyRoutes = new Hono<ModuleHonoEnv>()
  .get('/spaces/:spaceId/delivery-keys', spaceScoped(), async (c) =>
    c.json({
      deliveryKeys: await c.var.services
        .get(DELIVERY_KEY_SERVICE)
        .list(c.var.requestContext.actor, tenantOf(c)),
    }),
  )
  .post('/spaces/:spaceId/delivery-keys', spaceScoped(), async (c) => {
    const actor = c.var.requestContext.actor
    const tenant = tenantOf(c)
    const environments = await c.var.services.get(ENVIRONMENT_SERVICE).list(actor, tenant)
    const created = await c.var.services.get(DELIVERY_KEY_SERVICE).create(
      actor,
      tenant,
      (await c.req.json().catch(() => ({}))) as never,
      environments.map((e) => e.id),
    )
    // The key is shown once; only its hash is stored.
    return c.json({ key: created.key, ...created.record }, 201, { 'cache-control': 'no-store' })
  })
  .delete('/spaces/:spaceId/delivery-keys/:keyId', spaceScoped(), async (c) => {
    await c.var.services
      .get(DELIVERY_KEY_SERVICE)
      .revoke(c.var.requestContext.actor, tenantOf(c), c.req.param('keyId') ?? '')
    return c.body(null, 204)
  })

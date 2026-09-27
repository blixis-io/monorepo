import { type ModuleHonoEnv, TENANT_BINDER, ValidationError } from '@blixis/contracts'
import { requireTenant } from '@blixis/database'
import { spaceScoped } from '@blixis/spaces'
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import {
  WEBHOOK_SERVICE,
  type WebhookInput,
  type WebhookView,
} from '../application/webhook.service.ts'

type Ctx = Context<ModuleHonoEnv>
const json = async (c: Ctx) => (await c.req.json().catch(() => ({}))) as Record<string, unknown>
const actorOf = (c: Ctx) => c.var.requestContext.actor
const webhookId = (c: Ctx) => c.req.param('webhookId') ?? ''
const webhooks = (c: Ctx) => c.var.services.get(WEBHOOK_SERVICE)
const tenantOf = (c: Ctx) => {
  const { organizationId, spaceId } = requireTenant(
    c.var.requestContext,
    'organizationId',
    'spaceId',
  )
  return { organizationId, spaceId }
}

/**
 * Webhook-id routes (§31): resolves the webhook's space — verifying the actor may read it — and
 * binds it to the request, like `spaceScoped()` does for `/spaces/:spaceId`.
 */
export function webhookScoped() {
  return async (c: Ctx, next: Next): Promise<void> => {
    const tenant = await webhooks(c).resolveTenant(actorOf(c), webhookId(c))
    c.set('requestContext', c.var.services.get(TENANT_BINDER).bind(tenant))
    await next()
  }
}

const withEtag = (c: Ctx, webhook: WebhookView) => c.header('ETag', `"${webhook.version}"`)

function expectedVersion(c: Ctx, body: Record<string, unknown>): number {
  if (typeof body['expectedVersion'] === 'number') return body['expectedVersion']
  const header = c.req.header('if-match')
  const value =
    header === undefined ? Number.NaN : Number(header.replace(/^W\//, '').replaceAll('"', ''))
  if (!Number.isInteger(value))
    throw new ValidationError('Missing version', [
      { path: ['If-Match'], message: 'Send the webhook ETag (If-Match) or expectedVersion' },
    ])
  return value
}

/** Body → webhook input (unknown properties ignored; the service validates the rest). */
function input(body: Record<string, unknown>): Partial<WebhookInput> {
  const has = (key: string) => Object.hasOwn(body, key)
  return {
    ...(has('name') ? { name: body['name'] as string } : {}),
    ...(has('url') ? { url: body['url'] as string } : {}),
    ...(has('eventTypes') ? { eventTypes: body['eventTypes'] as string[] } : {}),
    ...(has('environmentId') ? { environmentId: body['environmentId'] as string | null } : {}),
    ...(has('active') ? { active: body['active'] === true } : {}),
  }
}

/** Webhook configuration routes (plan 015.001). */
export const webhookRoutes = new Hono<ModuleHonoEnv>()
  .get('/spaces/:spaceId/webhooks', spaceScoped(), async (c) =>
    c.json({ webhooks: await webhooks(c).list(actorOf(c), tenantOf(c)) }),
  )
  .post('/spaces/:spaceId/webhooks', spaceScoped(), async (c) => {
    const created = await webhooks(c).create(
      actorOf(c),
      tenantOf(c),
      input(await json(c)) as WebhookInput,
    )
    withEtag(c, created.webhook)
    return c.json(created, 201)
  })
  .get('/webhooks/:webhookId', webhookScoped(), async (c) => {
    const webhook = await webhooks(c).get(actorOf(c), tenantOf(c), webhookId(c))
    withEtag(c, webhook)
    return c.json(webhook)
  })
  .patch('/webhooks/:webhookId', webhookScoped(), async (c) => {
    const body = await json(c)
    const webhook = await webhooks(c).update(actorOf(c), tenantOf(c), webhookId(c), {
      ...input(body),
      expectedVersion: expectedVersion(c, body),
    })
    withEtag(c, webhook)
    return c.json(webhook)
  })
  .post('/webhooks/:webhookId/rotate-secret', webhookScoped(), async (c) => {
    const rotated = await webhooks(c).rotateSecret(actorOf(c), tenantOf(c), webhookId(c))
    withEtag(c, rotated.webhook)
    return c.json(rotated)
  })
  .delete('/webhooks/:webhookId', webhookScoped(), async (c) => {
    await webhooks(c).delete(actorOf(c), tenantOf(c), webhookId(c))
    return c.body(null, 204)
  })

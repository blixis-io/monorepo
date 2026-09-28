import { CONTENT_SERVICE } from '@blixis/content-api'
import {
  AUTHORIZATION_SERVICE,
  type ModuleHonoEnv,
  type PermissionDefinition,
  type RestOperation,
  validate,
} from '@blixis/contracts'
import { type Context, Hono } from 'hono'
import { z } from 'zod'
import { SEO_PERMISSIONS } from './permissions.ts'
import { SEO_SERVICE } from './service.ts'

const seoInput = z.object({
  title: z.string().trim().min(1).max(70).nullable(),
  description: z.string().trim().max(160).nullable(),
})

const seoView = z.object({
  entryId: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  lastPublishedAt: z.string().nullable(),
})

/**
 * The entry's tenant, after checking the actor may use `permission` on it. `resolveTenant` hides
 * entries the actor can't read (404); the permission check answers 403 for members without it.
 */
async function authorize(c: Context<ModuleHonoEnv>, permission: PermissionDefinition) {
  const { actor } = c.var.requestContext
  const entryId = c.req.param('entryId') ?? ''
  const tenant = await c.var.services.get(CONTENT_SERVICE).resolveTenant(actor, entryId)
  await c.var.services.get(AUTHORIZATION_SERVICE).require({
    actor,
    action: permission.id,
    resource: {
      type: 'entry',
      id: entryId,
      organizationId: tenant.organizationId,
      spaceId: tenant.spaceId,
    },
  })
  return { tenant, entryId }
}

/** `GET/PUT /api/v1/entries/:entryId/seo` (mounted at `/entries`). Handlers only translate HTTP. */
export const seoRoutes = new Hono<ModuleHonoEnv>()
  .get('/:entryId/seo', async (c) => {
    const { tenant, entryId } = await authorize(c, SEO_PERMISSIONS.read)
    return c.json(await c.var.services.get(SEO_SERVICE).get(tenant, entryId))
  })
  .put('/:entryId/seo', async (c) => {
    const { tenant, entryId } = await authorize(c, SEO_PERMISSIONS.write)
    const input = await validate(seoInput, await c.req.json(), { message: 'Invalid SEO metadata' })
    return c.json(await c.var.services.get(SEO_SERVICE).set(tenant, entryId, input))
  })

/** The routes, described for the OpenAPI document and SDKs (ADR 0015). */
export const SEO_OPERATIONS: readonly RestOperation[] = [
  {
    method: 'GET',
    path: '/:entryId/seo',
    id: 'getEntrySeo',
    tag: 'SEO',
    summary: 'SEO metadata of an entry',
    permission: SEO_PERMISSIONS.read.id,
    responses: { 200: { description: 'OK', schema: seoView } },
  },
  {
    method: 'PUT',
    path: '/:entryId/seo',
    id: 'setEntrySeo',
    tag: 'SEO',
    summary: 'Replace the SEO metadata of an entry',
    permission: SEO_PERMISSIONS.write.id,
    request: { body: seoInput },
    responses: { 200: { description: 'OK', schema: seoView } },
  },
]

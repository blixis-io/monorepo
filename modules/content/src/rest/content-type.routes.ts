import { type ModuleHonoEnv, ValidationError } from '@blixis/contracts'
import { requireTenant } from '@blixis/database'
import { spaceScoped } from '@blixis/spaces'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { CONTENT_TYPE_SERVICE } from '../application/content-type.service.ts'
import {
  CONTENT_TYPE_KINDS,
  type ContentTypeKind,
  type CreateContentTypeInput,
  type UpdateContentTypeInput,
} from '../domain/content-type.ts'

type Ctx = Context<ModuleHonoEnv>
const json = async (c: Ctx) => (await c.req.json().catch(() => ({}))) as unknown
const actorOf = (c: Ctx) => c.var.requestContext.actor
const contentTypeId = (c: Ctx) => c.req.param('contentTypeId') ?? ''
/** The verified environment tenant bound by `spaceScoped()` (`?environment=`, default `main`). */
const tenantOf = (c: Ctx) => {
  const { organizationId, spaceId, environmentId } = requireTenant(
    c.var.requestContext,
    'organizationId',
    'spaceId',
    'environmentId',
  )
  return { organizationId, spaceId, environmentId }
}
function kindFilter(c: Ctx): { kind?: ContentTypeKind } {
  const kind = c.req.query('kind')
  if (kind === undefined) return {}
  if (!(CONTENT_TYPE_KINDS as readonly string[]).includes(kind))
    throw new ValidationError('Invalid filter', [
      { path: ['kind'], message: 'Use entry or component' },
    ])
  return { kind: kind as ContentTypeKind }
}

/** `/api/v1/spaces/:spaceId/content-types[/:contentTypeId]` (plan 010.005). */
export const contentTypeRoutes = new Hono<ModuleHonoEnv>()
  .get('/spaces/:spaceId/content-types', spaceScoped(), async (c) =>
    c.json({
      contentTypes: await c.var.services
        .get(CONTENT_TYPE_SERVICE)
        .list(actorOf(c), tenantOf(c), kindFilter(c)),
    }),
  )
  .post('/spaces/:spaceId/content-types', spaceScoped(), async (c) =>
    c.json(
      await c.var.services
        .get(CONTENT_TYPE_SERVICE)
        .create(actorOf(c), tenantOf(c), (await json(c)) as CreateContentTypeInput),
      201,
    ),
  )
  .get('/spaces/:spaceId/content-types/:contentTypeId', spaceScoped(), async (c) =>
    c.json(
      await c.var.services.get(CONTENT_TYPE_SERVICE).get(actorOf(c), tenantOf(c), contentTypeId(c)),
    ),
  )
  .patch('/spaces/:spaceId/content-types/:contentTypeId', spaceScoped(), async (c) =>
    c.json(
      await c.var.services
        .get(CONTENT_TYPE_SERVICE)
        .update(
          actorOf(c),
          tenantOf(c),
          contentTypeId(c),
          (await json(c)) as UpdateContentTypeInput,
        ),
    ),
  )
  .delete('/spaces/:spaceId/content-types/:contentTypeId', spaceScoped(), async (c) => {
    await c.var.services.get(CONTENT_TYPE_SERVICE).delete(actorOf(c), tenantOf(c), contentTypeId(c))
    return c.body(null, 204)
  })

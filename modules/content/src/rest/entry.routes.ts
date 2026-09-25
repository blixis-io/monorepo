import { type ModuleHonoEnv, TENANT_BINDER, ValidationError } from '@blixis/contracts'
import { requireTenant } from '@blixis/database'
import { spaceScoped } from '@blixis/spaces'
import type { Context, Next } from 'hono'
import { Hono } from 'hono'
import {
  CONTENT_SERVICE,
  type EntryListQuery,
  type EntryView,
} from '../application/content.service.ts'

type Ctx = Context<ModuleHonoEnv>
const json = async (c: Ctx) => (await c.req.json().catch(() => ({}))) as Record<string, unknown>
const actorOf = (c: Ctx) => c.var.requestContext.actor
const entryId = (c: Ctx) => c.req.param('entryId') ?? ''
const tenantOf = (c: Ctx) => {
  const { organizationId, spaceId, environmentId } = requireTenant(
    c.var.requestContext,
    'organizationId',
    'spaceId',
    'environmentId',
  )
  return { organizationId, spaceId, environmentId }
}

/**
 * Entry-id routes (§31): resolves the entry's tenant — verifying the actor may read it — and
 * binds it to the request, like `spaceScoped()` does for `/spaces/:spaceId`.
 */
export function entryScoped() {
  return async (c: Ctx, next: Next): Promise<void> => {
    const tenant = await c.var.services.get(CONTENT_SERVICE).resolveTenant(actorOf(c), entryId(c))
    c.set('requestContext', c.var.services.get(TENANT_BINDER).bind(tenant))
    await next()
  }
}

/** `ETag` is the entry's current version: `If-Match` on changes maps to `expectedVersion`. */
const withEtag = (c: Ctx, entry: EntryView) => c.header('ETag', `"${entry.sys.version}"`)

/** `If-Match: "3"` (or `3`) → 3; a body `expectedVersion` wins when both are sent. */
function expectedVersion(c: Ctx, body: Record<string, unknown>): number | undefined {
  if (typeof body['expectedVersion'] === 'number') return body['expectedVersion']
  const header = c.req.header('if-match')
  if (header === undefined) return undefined
  const value = Number(header.replace(/^W\//, '').replaceAll('"', ''))
  if (!Number.isInteger(value))
    throw new ValidationError('Invalid If-Match', [
      { path: ['If-Match'], message: 'Use the ETag of the entry, e.g. "3"' },
    ])
  return value
}

function listQuery(c: Ctx): EntryListQuery {
  const query = c.req.query()
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(query))
    if (key.startsWith('fields.')) fields[key.slice(7)] = value
  const state = query['state']
  if (state !== undefined && state !== 'draft' && state !== 'published')
    throw new ValidationError('Invalid query', [
      { path: ['state'], message: 'Use draft or published' },
    ])
  const limit = query['limit'] === undefined ? undefined : Number(query['limit'])
  return {
    contentType: query['contentType'],
    state,
    updatedSince: query['updatedSince'],
    limit,
    cursor: query['cursor'],
    fields,
  }
}

/** Entry management routes (plan 011.003). Handlers only translate HTTP ⇄ `CONTENT_SERVICE`. */
export const entryRoutes = new Hono<ModuleHonoEnv>()
  .get('/spaces/:spaceId/entries', spaceScoped(), async (c) =>
    c.json(await c.var.services.get(CONTENT_SERVICE).list(actorOf(c), tenantOf(c), listQuery(c))),
  )
  .post('/spaces/:spaceId/entries', spaceScoped(), async (c) => {
    const body = await json(c)
    const entry = await c.var.services.get(CONTENT_SERVICE).create(actorOf(c), tenantOf(c), {
      contentType: String(body['contentType'] ?? ''),
      fields: body['fields'],
    })
    withEtag(c, entry)
    return c.json(entry, 201)
  })
  .get('/entries/:entryId', entryScoped(), async (c) => {
    const state = c.req.query('state')
    if (state !== undefined && state !== 'draft' && state !== 'published')
      throw new ValidationError('Invalid query', [
        { path: ['state'], message: 'Use draft or published' },
      ])
    const entry = await c.var.services
      .get(CONTENT_SERVICE)
      .get(actorOf(c), tenantOf(c), entryId(c), state === undefined ? {} : { state })
    withEtag(c, entry)
    return c.json(entry)
  })
  .patch('/entries/:entryId', entryScoped(), async (c) => {
    const body = await json(c)
    const entry = await c.var.services
      .get(CONTENT_SERVICE)
      .update(actorOf(c), tenantOf(c), entryId(c), {
        fields: body['fields'],
        expectedVersion: expectedVersion(c, body) ?? Number.NaN,
      })
    withEtag(c, entry)
    return c.json(entry)
  })
  .delete('/entries/:entryId', entryScoped(), async (c) => {
    const version = expectedVersion(c, {})
    await c.var.services
      .get(CONTENT_SERVICE)
      .delete(
        actorOf(c),
        tenantOf(c),
        entryId(c),
        version === undefined ? {} : { expectedVersion: version },
      )
    return c.body(null, 204)
  })

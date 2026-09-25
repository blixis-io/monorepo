import { type ModuleHonoEnv, UnauthorizedError } from '@blixis/contracts'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { PERMISSION_CATALOG } from '../application/catalog.ts'
import { ROLE_SERVICE } from '../application/role.service.ts'
import type { CreateRoleInput, UpdateRoleInput } from '../domain/role.ts'

type Ctx = Context<ModuleHonoEnv>
const json = async (c: Ctx) => (await c.req.json().catch(() => ({}))) as unknown

/**
 * `GET /api/v1/permissions` (the catalog grouped by module, for role editors) and
 * `/api/v1/organizations/:orgId/roles`. Handlers only translate HTTP ⇄ services.
 */
export const permissionsRoutes = new Hono<ModuleHonoEnv>()
  .get('/permissions', (c) => {
    const { actor } = c.var.requestContext
    if (actor.type !== 'user' && actor.type !== 'apiToken')
      throw new UnauthorizedError('Sign in to list permissions')
    const groups = new Map<
      string,
      { id: string; description: string; scope: string; defaultRoles: readonly string[] }[]
    >()
    for (const { module, id, description, scope, defaultRoles } of c.var.services
      .get(PERMISSION_CATALOG)
      .list()) {
      const group = groups.get(module) ?? []
      group.push({ id, description, scope, defaultRoles })
      groups.set(module, group)
    }
    return c.json({
      modules: [...groups].map(([module, permissions]) => ({ module, permissions })),
    })
  })
  .get('/organizations/:orgId/roles', async (c) =>
    c.json({
      roles: await c.var.services
        .get(ROLE_SERVICE)
        .list(c.var.requestContext.actor, c.req.param('orgId')),
    }),
  )
  .post('/organizations/:orgId/roles', async (c) =>
    c.json(
      await c.var.services
        .get(ROLE_SERVICE)
        .create(
          c.var.requestContext.actor,
          c.req.param('orgId'),
          (await json(c)) as CreateRoleInput,
        ),
      201,
    ),
  )
  .patch('/organizations/:orgId/roles/:roleId', async (c) =>
    c.json(
      await c.var.services
        .get(ROLE_SERVICE)
        .update(
          c.var.requestContext.actor,
          c.req.param('orgId'),
          c.req.param('roleId'),
          (await json(c)) as UpdateRoleInput,
        ),
    ),
  )
  .delete('/organizations/:orgId/roles/:roleId', async (c) => {
    await c.var.services
      .get(ROLE_SERVICE)
      .delete(c.var.requestContext.actor, c.req.param('orgId'), c.req.param('roleId'))
    return c.body(null, 204)
  })

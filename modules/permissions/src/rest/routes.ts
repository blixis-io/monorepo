import { type ModuleHonoEnv, UnauthorizedError } from '@blixis/contracts'
import { Hono } from 'hono'
import { PERMISSION_CATALOG } from '../application/catalog.ts'

/** `GET /api/v1/permissions`: the catalog grouped by declaring module (for role editors). */
export const permissionsRoutes = new Hono<ModuleHonoEnv>().get('/', (c) => {
  const { actor } = c.var.requestContext
  if (actor.type !== 'user' && actor.type !== 'apiToken')
    throw new UnauthorizedError('Sign in to list permissions')
  const groups = new Map<string, { id: string; description: string; scope: string }[]>()
  for (const { module, id, description, scope } of c.var.services.get(PERMISSION_CATALOG).list()) {
    const group = groups.get(module) ?? []
    group.push({ id, description, scope })
    groups.set(module, group)
  }
  return c.json({
    modules: [...groups].map(([module, permissions]) => ({ module, permissions })),
  })
})

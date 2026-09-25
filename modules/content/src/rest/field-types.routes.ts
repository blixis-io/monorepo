import { type ModuleHonoEnv, UnauthorizedError } from '@blixis/contracts'
import { Hono } from 'hono'
import { FIELD_TYPES } from '../field-types/define.ts'

/** `GET /api/v1/field-types`: every field type of this app with its settings JSON Schema. */
export const fieldTypeRoutes = new Hono<ModuleHonoEnv>().get('/field-types', (c) => {
  const { actor } = c.var.requestContext
  if (actor.type !== 'user' && actor.type !== 'apiToken')
    throw new UnauthorizedError('Sign in to list field types')
  return c.json({ fieldTypes: c.var.services.get(FIELD_TYPES).describe() })
})

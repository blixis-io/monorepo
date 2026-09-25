import { type Actor, type ModuleHonoEnv, UnauthorizedError, validate } from '@blixis/contracts'
import { Hono } from 'hono'
import { USER_SERVICE } from '../application/user.service.ts'
import { updateProfileSchema } from '../domain/user.ts'

/** The signed-in user's id; other actors (tokens act for users too — plan 009) are rejected. */
function currentUserId(actor: Actor): string {
  if (actor.type === 'user') return actor.userId
  if (actor.type === 'apiToken') return actor.ownerId
  throw new UnauthorizedError('Sign in to access your profile')
}

/** `/users/me` routes. Handlers only translate HTTP ⇄ service calls (§48 Code.8). */
export const usersRoutes = new Hono<ModuleHonoEnv>()
  .get('/me', async (c) => {
    const userId = currentUserId(c.var.requestContext.actor)
    return c.json(await c.var.services.get(USER_SERVICE).getById(userId))
  })
  .patch('/me', async (c) => {
    const userId = currentUserId(c.var.requestContext.actor)
    const input = await validate(updateProfileSchema, await c.req.json(), {
      message: 'Invalid profile',
    })
    return c.json(await c.var.services.get(USER_SERVICE).updateProfile(userId, input))
  })

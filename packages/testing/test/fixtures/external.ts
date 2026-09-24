// Fixture: written like a third-party npm package — only @blixis/contracts and hono, no kernel.
import type { ModuleFactory, ModuleHonoEnv } from '@blixis/contracts'
import { definePermission, UnauthorizedError } from '@blixis/contracts'
import { Hono } from 'hono'
import { z } from 'zod'
import { GREETING_SERVICE } from './greeting.ts'

const Config = z.object({ excited: z.boolean().default(false) })

const routes = new Hono<ModuleHonoEnv>().get('/greet/:name', (c) => {
  const { actor, logger } = c.var.requestContext
  if (actor.type === 'anonymous') throw new UnauthorizedError('Sign in to be greeted')
  const text = c.var.services.get(GREETING_SERVICE).greet(c.req.param('name'))
  logger.info('greeted', { actorType: actor.type })
  return c.json({ text })
})

export const external: ModuleFactory<{ excited?: boolean }, z.infer<typeof Config>> = (
  options = {},
) => ({
  meta: {
    name: '@acme/blixis-external',
    version: '1.0.0',
    requiresCapabilities: ['fixture.greeting'],
  },
  config: options,
  configSchema: Config,
  rest: { path: '/external', app: routes },
  permissions: [definePermission({ id: 'external.greet', description: 'Be greeted' })],
})

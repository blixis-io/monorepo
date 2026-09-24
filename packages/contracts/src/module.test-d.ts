// A module written the way a third-party package would: only @blixis/contracts, hono, and a
// schema library are imported. If this stops compiling, the public contract is incomplete (§42).
import { Hono } from 'hono'
import { expectTypeOf, test } from 'vitest'
import { z } from 'zod'
import {
  type BlixisModule,
  createServiceToken,
  defineEvent,
  defineMigration,
  definePermission,
  type ModuleFactory,
  type ModuleHonoEnv,
  subscribe,
} from './index.ts'

interface SeoService {
  titleFor(entryId: string): Promise<string>
}
const SEO_SERVICE = createServiceToken<SeoService>('@acme/blixis-seo.service')

const entryPublished = defineEvent({
  type: 'entry.published',
  version: 1,
  delivery: 'transactional',
  schema: z.object({ entryId: z.string(), spaceId: z.string() }),
})

const SeoConfig = z.object({ defaultTitle: z.string().default('Untitled') })
type SeoConfig = z.infer<typeof SeoConfig>

const routes = new Hono<ModuleHonoEnv>().get('/entries/:id/seo', async (c) => {
  const seo = c.var.services.get(SEO_SERVICE)
  c.var.requestContext.logger.info('seo lookup', { entryId: c.req.param('id') })
  return c.json({ title: await seo.titleFor(c.req.param('id')) })
})

const seo: ModuleFactory<{ defaultTitle?: string }, SeoConfig> = (options = {}) => ({
  meta: {
    name: '@acme/blixis-seo',
    version: '1.0.0',
    requiresCapabilities: ['blixis.content'],
    capabilities: ['acme.seo'],
  },
  config: options,
  configSchema: SeoConfig,
  setup(ctx) {
    expectTypeOf(ctx.config).toEqualTypeOf<SeoConfig>()
    ctx.services.provide(SEO_SERVICE, { titleFor: async () => ctx.config.defaultTitle })
    ctx.logger.debug('seo ready')
  },
  boot(ctx) {
    expectTypeOf(ctx.modules[0]?.name).toEqualTypeOf<string | undefined>()
  },
  rest: { path: '/seo', app: routes },
  graphql: {
    typeDefs: 'extend type Entry { seoTitle: String }',
    resolvers: { Entry: { seoTitle: () => 'x' } },
  },
  permissions: [definePermission({ id: 'seo.read', description: 'Read SEO metadata' })],
  events: [
    subscribe(entryPublished, 'refresh-seo', async (envelope) => void envelope.payload.entryId),
  ],
  migrations: [defineMigration({ id: '0001_create_seo', up: 'create table seo (entry_id text)' })],
})

test('a third-party module compiles against contracts only', () => {
  expectTypeOf(seo({ defaultTitle: 'Home' })).toEqualTypeOf<BlixisModule<SeoConfig>>()
  expectTypeOf(seo).toBeCallableWith()
})

test('meta.name and meta.version are required', () => {
  // @ts-expect-error missing name
  const noName: BlixisModule = { meta: { version: '1.0.0' } }
  // @ts-expect-error missing version
  const noVersion: BlixisModule = { meta: { name: '@acme/x' } }
  void noName
  void noVersion
})

test('rest apps must use the module env', () => {
  const wrong: BlixisModule = {
    meta: { name: '@acme/x', version: '1.0.0' },
    // @ts-expect-error variables do not match ModuleHonoEnv
    rest: { path: '/x', app: new Hono<{ Variables: { other: number } }>() },
  }
  void wrong
})

test('factories without options take no arguments', () => {
  const content: ModuleFactory = () => ({ meta: { name: '@blixis/content', version: '0.0.0' } })
  expectTypeOf(content).parameters.toEqualTypeOf<[]>()
})

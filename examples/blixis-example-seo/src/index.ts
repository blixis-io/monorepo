/**
 * `@blixis-example/seo` — an example third-party Blixis module (plan 018.003). It uses only public
 * packages: `@blixis/contracts`, `@blixis/kernel`, `@blixis/content-api`, and `@blixis/database`.
 *
 * @packageDocumentation
 */
import { BLIXIS_CAPABILITIES } from '@blixis-io/contracts'
import { DATABASE } from '@blixis-io/database'
import { defineModule } from '@blixis-io/kernel'
import { z } from 'zod'
import { onEntryDeleted, onEntryPublished, onSpaceDeleted } from './events.ts'
import { seoGraphQL } from './graphql.ts'
import { createSeo } from './migrations.ts'
import { SEO_PERMISSIONS } from './permissions.ts'
import { SEO_OPERATIONS, seoRoutes } from './routes.ts'
import { createSeoService, SEO_SERVICE } from './service.ts'

/** Options of the module, validated at startup. */
export interface SeoOptions {
  /** Title of entries without their own SEO title. Default `Untitled`. */
  readonly defaultTitle?: string
}

const configSchema = z.object({ defaultTitle: z.string().min(1).max(70).default('Untitled') })

/** The module factory: `modules: [content(), seo({ defaultTitle: 'My site' })]`. */
const seo = defineModule<SeoOptions, z.output<typeof configSchema>>((options = {}) => ({
  meta: {
    name: '@blixis-example/seo',
    version: '0.1.0',
    capabilities: ['example.seo'],
    requiresCapabilities: [
      BLIXIS_CAPABILITIES.database,
      BLIXIS_CAPABILITIES.content,
      BLIXIS_CAPABILITIES.permissions,
    ],
  },
  config: options,
  configSchema,
  migrations: [createSeo],
  permissions: Object.values(SEO_PERMISSIONS),
  setup(ctx) {
    const { defaultTitle } = ctx.config
    ctx.services.provideFactory(
      SEO_SERVICE,
      ({ services }) => createSeoService(services.get(DATABASE), defaultTitle),
      { scope: 'request' },
    )
  },
  rest: { path: '/entries', app: seoRoutes, operations: SEO_OPERATIONS },
  graphql: seoGraphQL,
  events: [onEntryPublished, onEntryDeleted, onSpaceDeleted],
}))

export default seo
export { SEO_PERMISSIONS } from './permissions.ts'
export { SEO_SERVICE, type SeoMetadata, type SeoService } from './service.ts'

// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import { createStarlightTypeDocPlugin } from 'starlight-typedoc'

const [contractsTypeDoc, contractsSidebar] = createStarlightTypeDocPlugin()
const [kernelTypeDoc, kernelSidebar] = createStarlightTypeDocPlugin()
const [testingTypeDoc, testingSidebar] = createStarlightTypeDocPlugin()
const [databaseTypeDoc, databaseSidebar] = createStarlightTypeDocPlugin()
const [eventsTypeDoc, eventsSidebar] = createStarlightTypeDocPlugin()
const [contentApiTypeDoc, contentApiSidebar] = createStarlightTypeDocPlugin()
const [contentTypeDoc, contentSidebar] = createStarlightTypeDocPlugin()
const [graphqlTypeDoc, graphqlSidebar] = createStarlightTypeDocPlugin()
const [cloudflareTypeDoc, cloudflareSidebar] = createStarlightTypeDocPlugin()
const [sharedTypeDoc, sharedSidebar] = createStarlightTypeDocPlugin()
const [usersTypeDoc, usersSidebar] = createStarlightTypeDocPlugin()
const [authTypeDoc, authSidebar] = createStarlightTypeDocPlugin()
const [spacesTypeDoc, spacesSidebar] = createStarlightTypeDocPlugin()
const [permissionsTypeDoc, permissionsSidebar] = createStarlightTypeDocPlugin()
const [assetsTypeDoc, assetsSidebar] = createStarlightTypeDocPlugin()
const [webhooksTypeDoc, webhooksSidebar] = createStarlightTypeDocPlugin()
const [sdkTypeDoc, sdkSidebar] = createStarlightTypeDocPlugin()

/** Shared TypeDoc options for all documented packages (ADR 0018). */
const typeDoc = {
  excludeInternal: true,
  excludePrivate: true,
  sort: /** @type {const} */ (['kind', 'alphabetical']),
}

export default defineConfig({
  site: 'https://blixis-docs.frosty-hill-6079.workers.dev',
  telemetry: false,
  integrations: [
    starlight({
      title: 'Blixis',
      description: 'Developer documentation for building Blixis modules.',
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/blixis-io/monorepo' }],
      editLink: { baseUrl: 'https://github.com/blixis-io/monorepo/edit/main/apps/docs/' },
      lastUpdated: true,
      plugins: [
        // API reference generated from TSDoc (ADR 0018). TypeDoc runs on the TypeScript 6
        // installed in this app only; library packages are compiled with TypeScript 7.
        contractsTypeDoc({
          entryPoints: ['../../packages/contracts/src/index.ts'],
          tsconfig: '../../packages/contracts/tsconfig.json',
          output: 'api/contracts',
          sidebar: { label: '@blixis-io/contracts' },
          typeDoc,
        }),
        kernelTypeDoc({
          entryPoints: ['../../packages/kernel/src/index.ts'],
          tsconfig: '../../packages/kernel/tsconfig.json',
          output: 'api/kernel',
          sidebar: { label: '@blixis-io/kernel' },
          typeDoc,
        }),
        testingTypeDoc({
          entryPoints: ['../../packages/testing/src/index.ts'],
          tsconfig: '../../packages/testing/tsconfig.json',
          output: 'api/testing',
          sidebar: { label: '@blixis-io/testing' },
          typeDoc,
        }),
        databaseTypeDoc({
          entryPoints: ['../../packages/database/src/index.ts'],
          tsconfig: '../../packages/database/tsconfig.json',
          output: 'api/database',
          sidebar: { label: '@blixis-io/database' },
          typeDoc,
        }),
        eventsTypeDoc({
          entryPoints: ['../../packages/events/src/index.ts'],
          tsconfig: '../../packages/events/tsconfig.json',
          output: 'api/events',
          sidebar: { label: '@blixis-io/events' },
          typeDoc,
        }),
        contentApiTypeDoc({
          entryPoints: ['../../packages/content-api/src/index.ts'],
          tsconfig: '../../packages/content-api/tsconfig.json',
          output: 'api/content-api',
          sidebar: { label: '@blixis-io/content-api' },
          typeDoc,
        }),
        contentTypeDoc({
          entryPoints: ['../../modules/content/src/index.ts'],
          tsconfig: '../../modules/content/tsconfig.json',
          output: 'api/content',
          sidebar: { label: '@blixis-io/content' },
          typeDoc,
        }),
        graphqlTypeDoc({
          entryPoints: ['../../packages/graphql/src/index.ts'],
          tsconfig: '../../packages/graphql/tsconfig.json',
          output: 'api/graphql',
          sidebar: { label: '@blixis-io/graphql' },
          typeDoc,
        }),
        cloudflareTypeDoc({
          entryPoints: ['../../packages/cloudflare/src/index.ts'],
          tsconfig: '../../packages/cloudflare/tsconfig.json',
          output: 'api/cloudflare',
          sidebar: { label: '@blixis-io/cloudflare' },
          typeDoc,
        }),
        sharedTypeDoc({
          entryPoints: ['../../packages/shared/src/index.ts'],
          tsconfig: '../../packages/shared/tsconfig.json',
          output: 'api/shared',
          sidebar: { label: '@blixis-io/shared' },
          typeDoc,
        }),
        usersTypeDoc({
          entryPoints: ['../../modules/users/src/index.ts'],
          tsconfig: '../../modules/users/tsconfig.json',
          output: 'api/users',
          sidebar: { label: '@blixis-io/users' },
          typeDoc,
        }),
        authTypeDoc({
          entryPoints: ['../../modules/auth/src/index.ts'],
          tsconfig: '../../modules/auth/tsconfig.json',
          output: 'api/auth',
          sidebar: { label: '@blixis-io/auth' },
          typeDoc,
        }),
        spacesTypeDoc({
          entryPoints: ['../../modules/spaces/src/index.ts'],
          tsconfig: '../../modules/spaces/tsconfig.json',
          output: 'api/spaces',
          sidebar: { label: '@blixis-io/spaces' },
          typeDoc,
        }),
        permissionsTypeDoc({
          entryPoints: ['../../modules/permissions/src/index.ts'],
          tsconfig: '../../modules/permissions/tsconfig.json',
          output: 'api/permissions',
          sidebar: { label: '@blixis-io/permissions' },
          typeDoc,
        }),
        assetsTypeDoc({
          entryPoints: ['../../modules/assets/src/index.ts'],
          tsconfig: '../../modules/assets/tsconfig.json',
          output: 'api/assets',
          sidebar: { label: '@blixis-io/assets' },
          typeDoc,
        }),
        webhooksTypeDoc({
          entryPoints: ['../../modules/webhooks/src/index.ts'],
          tsconfig: '../../modules/webhooks/tsconfig.json',
          output: 'api/webhooks',
          sidebar: { label: '@blixis-io/webhooks' },
          typeDoc,
        }),
        sdkTypeDoc({
          entryPoints: ['../../packages/sdk/src/index.ts'],
          tsconfig: '../../packages/sdk/tsconfig.json',
          output: 'api/sdk',
          sidebar: { label: '@blixis-io/sdk' },
          typeDoc,
        }),
      ],
      sidebar: [
        { label: 'Getting started', items: [{ autogenerate: { directory: 'getting-started' } }] },
        { label: 'Tutorials', items: [{ autogenerate: { directory: 'tutorials' } }] },
        { label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
        { label: 'Content reference', items: [{ autogenerate: { directory: 'content' } }] },
        { label: 'Extending Blixis', items: [{ autogenerate: { directory: 'extending' } }] },
        {
          label: 'API reference',
          items: [
            contractsSidebar,
            kernelSidebar,
            testingSidebar,
            databaseSidebar,
            eventsSidebar,
            sharedSidebar,
            graphqlSidebar,
            cloudflareSidebar,
            usersSidebar,
            authSidebar,
            spacesSidebar,
            permissionsSidebar,
            contentApiSidebar,
            contentSidebar,
            assetsSidebar,
            webhooksSidebar,
            sdkSidebar,
          ],
        },
      ],
    }),
  ],
})

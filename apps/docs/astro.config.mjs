// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import { createStarlightTypeDocPlugin } from 'starlight-typedoc'

const [contractsTypeDoc, contractsSidebar] = createStarlightTypeDocPlugin()
const [kernelTypeDoc, kernelSidebar] = createStarlightTypeDocPlugin()
const [testingTypeDoc, testingSidebar] = createStarlightTypeDocPlugin()
const [databaseTypeDoc, databaseSidebar] = createStarlightTypeDocPlugin()
const [eventsTypeDoc, eventsSidebar] = createStarlightTypeDocPlugin()
const [contentTypeDoc, contentSidebar] = createStarlightTypeDocPlugin()

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
          sidebar: { label: '@blixis/contracts' },
          typeDoc,
        }),
        kernelTypeDoc({
          entryPoints: ['../../packages/kernel/src/index.ts'],
          tsconfig: '../../packages/kernel/tsconfig.json',
          output: 'api/kernel',
          sidebar: { label: '@blixis/kernel' },
          typeDoc,
        }),
        testingTypeDoc({
          entryPoints: ['../../packages/testing/src/index.ts'],
          tsconfig: '../../packages/testing/tsconfig.json',
          output: 'api/testing',
          sidebar: { label: '@blixis/testing' },
          typeDoc,
        }),
        databaseTypeDoc({
          entryPoints: ['../../packages/database/src/index.ts'],
          tsconfig: '../../packages/database/tsconfig.json',
          output: 'api/database',
          sidebar: { label: '@blixis/database' },
          typeDoc,
        }),
        eventsTypeDoc({
          entryPoints: ['../../packages/events/src/index.ts'],
          tsconfig: '../../packages/events/tsconfig.json',
          output: 'api/events',
          sidebar: { label: '@blixis/events' },
          typeDoc,
        }),
        contentTypeDoc({
          entryPoints: ['../../modules/content/src/index.ts'],
          tsconfig: '../../modules/content/tsconfig.json',
          output: 'api/content',
          sidebar: { label: '@blixis/content' },
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
            contentSidebar,
          ],
        },
      ],
    }),
  ],
})

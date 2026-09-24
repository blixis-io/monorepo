// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import { createStarlightTypeDocPlugin } from 'starlight-typedoc'

const [contractsTypeDoc, contractsSidebar] = createStarlightTypeDocPlugin()
const [kernelTypeDoc, kernelSidebar] = createStarlightTypeDocPlugin()

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
      ],
      sidebar: [
        { label: 'Getting started', items: [{ autogenerate: { directory: 'getting-started' } }] },
        { label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
        { label: 'API reference', items: [contractsSidebar, kernelSidebar] },
      ],
    }),
  ],
})

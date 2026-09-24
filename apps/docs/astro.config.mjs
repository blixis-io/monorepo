// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'
import starlightTypeDoc, { typeDocSidebarGroup } from 'starlight-typedoc'

export default defineConfig({
  site: 'https://blixis-docs.workers.dev', // replaced with the real URL in task 023.004
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
        starlightTypeDoc({
          entryPoints: ['../../packages/contracts/src/index.ts'],
          tsconfig: '../../packages/contracts/tsconfig.json',
          output: 'api/contracts',
          sidebar: { label: '@blixis/contracts', collapsed: false },
          typeDoc: {
            excludeInternal: true,
            excludePrivate: true,
            sort: ['kind', 'alphabetical'],
            treatWarningsAsErrors: false,
          },
        }),
      ],
      sidebar: [
        { label: 'Getting started', items: [{ autogenerate: { directory: 'getting-started' } }] },
        { label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
        { label: 'API reference', items: [typeDocSidebarGroup] },
      ],
    }),
  ],
})

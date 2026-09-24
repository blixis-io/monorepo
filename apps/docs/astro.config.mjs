// @ts-check
import starlight from '@astrojs/starlight'
import { defineConfig } from 'astro/config'

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
      sidebar: [
        { label: 'Getting started', items: [{ autogenerate: { directory: 'getting-started' } }] },
        { label: 'Concepts', items: [{ autogenerate: { directory: 'concepts' } }] },
      ],
    }),
  ],
})

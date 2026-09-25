import { BLIXIS_CAPABILITIES } from '@blixis/contracts'
import { defineModule } from '@blixis/kernel'
import { createSpaces } from './infrastructure/migrations/0001_create_spaces.ts'

/**
 * The tenant hierarchy (architecture §21, plan 008): organizations → spaces → environments and
 * locales. Services, routes, and tenant resolution are added by 008.002–008.005.
 */
export const spacesModule = defineModule({
  meta: {
    name: '@blixis/spaces',
    version: '0.0.0',
    capabilities: [BLIXIS_CAPABILITIES.spaces],
    requires: { '@blixis/users': '>=0.0.0' },
    requiresCapabilities: [BLIXIS_CAPABILITIES.database, BLIXIS_CAPABILITIES.events],
  },
  migrations: [createSpaces],
})

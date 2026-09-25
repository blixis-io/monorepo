import { describe, expect, it } from 'vitest'
import { isTenantScoped } from './isolation.ts'

describe('isTenantScoped', () => {
  it('matches organization, space, and resource-id routes', () => {
    for (const path of [
      '/api/v1/organizations/:orgId',
      '/api/v1/spaces/:spaceId/locales',
      '/api/v1/entries/:entryId',
      '/api/v1/entries/:entryId/versions',
    ])
      expect(isTenantScoped(path), path).toBe(true)
    for (const path of [
      '/api/v1/organizations',
      '/api/v1/auth/tokens/:id',
      '/api/v1/entriesx/:entryId',
    ])
      expect(isTenantScoped(path), path).toBe(false)
  })
})

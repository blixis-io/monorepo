import { validateSync } from '@blixis-io/contracts'
import { describe, expect, it } from 'vitest'
import { entryPublished, entryUpdated } from './events.ts'

describe('content events', () => {
  it('validates the content events as before', () => {
    const payload = {
      entryId: 'e',
      organizationId: 'o',
      spaceId: 's',
      environmentId: 'env',
      contentTypeId: 't',
      versionId: 'v',
    }
    expect(validateSync(entryPublished.schema, payload)).toEqual(payload)
    expect(validateSync(entryUpdated.schema, { ...payload, restoredFrom: 'v0' })).toMatchObject({
      restoredFrom: 'v0',
    })
    expect(entryPublished).toMatchObject({
      type: 'entry.published',
      version: 1,
      delivery: 'transactional',
    })
  })
})

import { ValidationError, validateSync } from '@blixis/contracts'
import { describe, expect, it } from 'vitest'
import { entryPublished, entryUpdated } from './events.ts'
import { struct } from './schema.ts'

describe('dependency-free event schemas', () => {
  const schema = struct({ id: 'string', note: 'string?', count: 'int', kind: ['a', 'b'] })

  it('accepts valid payloads and drops unknown keys', () => {
    expect(validateSync(schema, { id: 'x', count: 2, kind: 'a', extra: true })).toEqual({
      id: 'x',
      count: 2,
      kind: 'a',
    })
    expect(validateSync(schema, { id: 'x', note: 'n', count: 0, kind: 'b' })).toMatchObject({
      note: 'n',
    })
  })

  it('reports every problem with its path', () => {
    try {
      validateSync(schema, { id: 1, note: 2, count: 1.5, kind: 'c' })
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ValidationError)
      expect((error as ValidationError).issues.map((i) => i.path.join('.'))).toEqual([
        'id',
        'note',
        'count',
        'kind',
      ])
    }
    expect(() => validateSync(schema, null)).toThrow(ValidationError)
  })

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

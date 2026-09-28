import { describe, expect, it } from 'vitest'
import { ValidationError } from './errors.ts'
import { struct } from './struct.ts'
import { spaceDeleted } from './tenancy.ts'
import { validateSync } from './validation.ts'

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

  it('validates space.deleted', () => {
    expect(validateSync(spaceDeleted.schema, { spaceId: 's', organizationId: 'o', x: 1 })).toEqual({
      spaceId: 's',
      organizationId: 'o',
    })
    expect(spaceDeleted).toMatchObject({
      type: 'space.deleted',
      version: 1,
      delivery: 'transactional',
    })
  })
})

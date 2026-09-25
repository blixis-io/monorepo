import { describe, expect, it } from 'vitest'
import { asAnonymous, asUser } from './actors.ts'
import { defineAuthzMatrix, expectedAuthzStatus } from './authz-matrix.ts'

describe('authorization matrix', () => {
  it('derives the expected status from the case permissions', () => {
    const user = asUser('u')
    expect(expectedAuthzStatus(asAnonymous(), new Set(['a.read']), 'a.read')).toBe(401)
    expect(expectedAuthzStatus(user, undefined, 'a.read')).toBe(404)
    expect(expectedAuthzStatus(user, new Set(['a.read']), 'a.read')).toBe('2xx')
    expect(expectedAuthzStatus(user, new Set(['a.read']), 'a.write')).toBe(403)
  })

  it('rejects invalid permission ids and duplicate rows', () => {
    const row = { method: 'GET', path: '/x', permission: 'a.read', level: 'space' } as const
    expect(defineAuthzMatrix([row])).toEqual([row])
    expect(() => defineAuthzMatrix([row, row])).toThrowError(/listed twice/)
    expect(() => defineAuthzMatrix([{ ...row, permission: 'read' as never }])).toThrowError(
      /invalid permission id/,
    )
  })
})

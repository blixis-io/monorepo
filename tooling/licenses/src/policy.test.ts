import { describe, expect, it } from 'vitest'
import { violations } from './policy.ts'

describe('licence policy', () => {
  it('accepts permissive licences, compound expressions with an allowed side, and exceptions', () => {
    expect(
      violations({
        MIT: [{ name: 'a' }],
        '(MIT OR GPL-3.0)': [{ name: 'b' }],
        'MPL-2.0': [{ name: 'lightningcss' }],
      }),
    ).toEqual([])
  })

  it('reports copyleft, unknown, and AND-combined licences that are not all allowed', () => {
    expect(
      violations({
        'GPL-3.0': [{ name: 'gpl-thing' }],
        Unknown: [{ name: 'mystery' }],
        'MIT AND AGPL-3.0': [{ name: 'mixed' }],
      }),
    ).toEqual(['gpl-thing (GPL-3.0)', 'mixed (MIT AND AGPL-3.0)', 'mystery (Unknown)'])
  })
})

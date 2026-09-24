import { describe, expect, it } from 'vitest'
import { compareVersions, parseVersion, satisfies } from './semver.ts'

describe('parseVersion', () => {
  it('parses strict versions', () => {
    expect(parseVersion('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] })
    expect(parseVersion('1.0.0-beta.2+build.5')?.prerelease).toEqual(['beta', 2])
    for (const bad of ['1.2', '01.2.3', '1.2.3.4', 'latest', ''])
      expect(parseVersion(bad)).toBeUndefined()
  })
})

describe('compareVersions', () => {
  const order = [
    '1.0.0-alpha',
    '1.0.0-alpha.1',
    '1.0.0-beta',
    '1.0.0-beta.2',
    '1.0.0-beta.11',
    '1.0.0',
    '1.0.1',
    '1.1.0',
    '2.0.0',
  ]
  it('orders per semver precedence', () => {
    for (let i = 1; i < order.length; i++) {
      const a = parseVersion(order[i - 1] ?? '')
      const b = parseVersion(order[i] ?? '')
      if (a === undefined || b === undefined) throw new Error('bad fixture')
      expect(compareVersions(a, b)).toBeLessThan(0)
      expect(compareVersions(b, a)).toBeGreaterThan(0)
    }
  })
})

describe('satisfies', () => {
  const cases: [string, string, boolean][] = [
    ['1.2.3', '^1.0.0', true],
    ['2.0.0', '^1.0.0', false],
    ['0.2.5', '^0.2.3', true],
    ['0.3.0', '^0.2.3', false],
    ['0.0.4', '^0.0.3', false],
    ['1.2.9', '~1.2.3', true],
    ['1.3.0', '~1.2.3', false],
    ['1.2.3', '1.2.3', true],
    ['1.2.4', '1.2.3', false],
    ['1.9.0', '1.x', true],
    ['2.0.0', '1.x', false],
    ['5.0.0', '*', true],
    ['1.5.0', '>=1.2.0 <2.0.0', true],
    ['2.0.0', '>=1.2.0 <2.0.0', false],
    ['3.1.0', '^1.0.0 || ^3.0.0', true],
    ['1.0.0-beta.1', '^1.0.0', false],
    ['1.0.0-beta.2', '^1.0.0-beta.1', true],
    ['1.0.1-beta.1', '^1.0.0-beta.1', false],
  ]
  it.each(cases)('%s satisfies %s → %s', (version, range, expected) => {
    expect(satisfies(version, range)).toBe(expected)
  })

  it('returns undefined for unparsable input', () => {
    expect(satisfies('not-a-version', '^1.0.0')).toBeUndefined()
    expect(satisfies('1.0.0', 'latest')).toBeUndefined()
  })
})

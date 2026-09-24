import { describe, expect, it } from 'vitest'
import { BLIXIS_CAPABILITIES, isCapabilityId } from './capabilities.ts'
import { createServiceToken } from './services.ts'

describe('createServiceToken', () => {
  it('returns the same id for the same name (works across duplicated package instances)', () => {
    expect(createServiceToken('@acme/x.service').id).toBe(createServiceToken('@acme/x.service').id)
    expect(createServiceToken('@acme/x.service').id).toBe(Symbol.for('@acme/x.service'))
  })

  it('returns different ids for different names', () => {
    expect(createServiceToken('a').id).not.toBe(createServiceToken('b').id)
  })

  it('returns frozen tokens that carry their name', () => {
    const token = createServiceToken<number>('@acme/n')
    expect(token.name).toBe('@acme/n')
    expect(Object.isFrozen(token)).toBe(true)
  })
})

describe('capabilities', () => {
  it('validates the naming convention', () => {
    expect(isCapabilityId('blixis.assets')).toBe(true)
    expect(isCapabilityId('acme.seo-tools')).toBe(true)
    expect(isCapabilityId('assets')).toBe(false)
    expect(isCapabilityId('Blixis.Assets')).toBe(false)
    expect(isCapabilityId('blixis..assets')).toBe(false)
  })

  it('lists first-party capabilities that all follow the convention', () => {
    for (const id of Object.values(BLIXIS_CAPABILITIES)) expect(isCapabilityId(id)).toBe(true)
  })
})

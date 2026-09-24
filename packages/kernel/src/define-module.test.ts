import { describe, expect, it } from 'vitest'
import { defineModule } from './define-module.ts'

describe('defineModule', () => {
  it('object form returns a zero-argument factory yielding the same frozen module', () => {
    const content = defineModule({ meta: { name: '@blixis/content', version: '1.0.0' } })
    const a = content()
    expect(a.meta.name).toBe('@blixis/content')
    expect(content()).toBe(a)
    expect(Object.isFrozen(a)).toBe(true)
  })

  it('factory form passes options through and freezes each result', () => {
    const seo = defineModule((options: { defaultTitle?: string }) => ({
      meta: { name: '@acme/blixis-seo', version: '1.0.0' },
      config: options,
    }))
    const m = seo({ defaultTitle: 'Home' })
    expect(m.config).toEqual({ defaultTitle: 'Home' })
    expect(Object.isFrozen(m)).toBe(true)
    expect(seo().config).toEqual({})
  })

  it('does not share state between factory calls', () => {
    const seo = defineModule((options: { n?: number }) => ({
      meta: { name: '@acme/x', version: '1.0.0' },
      config: options,
    }))
    expect(seo({ n: 1 })).not.toBe(seo({ n: 1 }))
  })
})

import { describe, expect, it } from 'vitest'
import { canonicalLocale, localeCodeSchema, slugSchema } from './tenancy.ts'

describe('tenancy domain rules', () => {
  it('accepts DNS-label-like slugs (lower-cased) and rejects others', () => {
    expect(slugSchema.parse(' My-Blog ')).toBe('my-blog')
    for (const bad of ['-blog', 'blog-', 'my_blog', 'a'.repeat(64), '', 'blöG']) {
      expect(slugSchema.safeParse(bad).success).toBe(false)
    }
  })

  it('canonicalizes BCP 47 locale tags', () => {
    expect(canonicalLocale('en-us')).toBe('en-US')
    expect(canonicalLocale('NL')).toBe('nl')
    expect(canonicalLocale('zh-hant-tw')).toBe('zh-Hant-TW')
    expect(canonicalLocale('not a locale')).toBeUndefined()
    expect(localeCodeSchema.parse('de-at')).toBe('de-AT')
    expect(localeCodeSchema.safeParse('en_US!').success).toBe(false)
  })
})

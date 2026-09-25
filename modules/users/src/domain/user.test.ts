import { describe, expect, it } from 'vitest'
import { displayNameSchema, emailSchema, normalizeEmail } from './user.ts'

describe('user domain rules', () => {
  it('normalizes emails (trim + lower-case)', () => {
    expect(normalizeEmail('  Ada@Example.COM ')).toBe('ada@example.com')
    expect(emailSchema.parse(' Ada@Example.com')).toBe('ada@example.com')
  })

  it('rejects invalid emails and display names', () => {
    expect(emailSchema.safeParse('not-an-email').success).toBe(false)
    expect(emailSchema.safeParse(`${'a'.repeat(250)}@x.io`).success).toBe(false)
    expect(displayNameSchema.safeParse('   ').success).toBe(false)
    expect(displayNameSchema.safeParse('x'.repeat(101)).success).toBe(false)
    expect(displayNameSchema.parse('  Ada  ')).toBe('Ada')
  })
})

import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { ValidationError } from './errors.ts'
import type { StandardSchemaV1 } from './standard-schema.ts'
import { toValidationIssues, validate, validateSync } from './validation.ts'

z.config({ jitless: true })

const Entry = z.object({
  title: z.string().min(1),
  locale: z.string().default('en-US'),
  fields: z.object({ tags: z.array(z.string()).max(2) }),
})

describe('validate', () => {
  it('returns typed output with defaults applied', async () => {
    await expect(validate(Entry, { title: 'Hello', fields: { tags: [] } })).resolves.toEqual({
      title: 'Hello',
      locale: 'en-US',
      fields: { tags: [] },
    })
  })

  it('throws ValidationError with normalised paths', async () => {
    const error = await validate(Entry, { title: '', fields: { tags: ['a', 'b', 'c'] } }).catch(
      (e: unknown) => e,
    )
    expect(error).toBeInstanceOf(ValidationError)
    const issues = (error as ValidationError).issues
    expect(issues.map((i) => i.path)).toEqual([['title'], ['fields', 'tags']])
    expect(issues.every((i) => typeof i.message === 'string' && i.message.length > 0)).toBe(true)
    expect(issues[0]?.code).toBe('too_small')
  })

  it('uses a custom message', async () => {
    await expect(validate(Entry, null, { message: 'Invalid entry' })).rejects.toThrowError(
      'Invalid entry',
    )
  })

  it('supports async schemas', async () => {
    const Slug = z.string().refine(async (s) => s !== 'taken', 'Slug is taken')
    await expect(validate(Slug, 'free')).resolves.toBe('free')
    await expect(validate(Slug, 'taken')).rejects.toBeInstanceOf(ValidationError)
  })
})

describe('validateSync', () => {
  it('validates synchronously', () => {
    expect(validateSync(z.number().int(), 3)).toBe(3)
    expect(() => validateSync(z.number().int(), 3.5)).toThrowError(ValidationError)
  })

  it('rejects async schemas with a TypeError', () => {
    const Async = z.string().refine(async () => true)
    expect(() => validateSync(Async, 'x')).toThrowError(TypeError)
  })
})

describe('toValidationIssues', () => {
  it('normalises path segments objects and symbols, and keeps string codes', () => {
    const issues: StandardSchemaV1.Issue[] = [
      { message: 'a', path: [{ key: 'fields' }, 0, Symbol.for('s')] },
      { message: 'root' },
    ]
    expect(toValidationIssues(issues)).toEqual([
      { path: ['fields', 0, 'Symbol(s)'], message: 'a' },
      { path: [], message: 'root' },
    ])
  })
})

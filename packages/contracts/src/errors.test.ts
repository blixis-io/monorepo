import { describe, expect, it } from 'vitest'
import {
  type BlixisError,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  isBlixisError,
  ModuleError,
  NotFoundError,
  RateLimitError,
  toPublicErrorShape,
  UnauthorizedError,
  ValidationError,
} from './errors.ts'

describe('error classes', () => {
  const cases: [BlixisError, string, string][] = [
    [new ValidationError('bad'), 'VALIDATION_FAILED', 'ValidationError'],
    [new NotFoundError('missing'), 'NOT_FOUND', 'NotFoundError'],
    [new ConflictError('dup'), 'CONFLICT', 'ConflictError'],
    [new ForbiddenError('no'), 'FORBIDDEN', 'ForbiddenError'],
    [new UnauthorizedError('who'), 'UNAUTHORIZED', 'UnauthorizedError'],
    [new RateLimitError('slow down'), 'RATE_LIMITED', 'RateLimitError'],
    [new ModuleError('@acme/seo', 'broken'), 'MODULE_ERROR', 'ModuleError'],
    [new InfrastructureError('db down'), 'INFRASTRUCTURE_ERROR', 'InfrastructureError'],
  ]

  it.each(cases)('%o has code %s and name %s', (error, code, name) => {
    expect(error.code).toBe(code)
    expect(error.name).toBe(name)
    expect(error).toBeInstanceOf(Error)
    expect(isBlixisError(error)).toBe(true)
  })

  it('ValidationError carries normalised issues as details', () => {
    const issues = [{ path: ['title'], message: 'Required' }]
    const error = new ValidationError('Invalid entry', issues)
    expect(error.issues).toEqual(issues)
    expect(error.details).toEqual({ issues })
  })

  it('ModuleError names the offending module', () => {
    const error = new ModuleError('@acme/seo', 'missing capability blixis.content')
    expect(error.moduleName).toBe('@acme/seo')
    expect(error.message).toBe('[@acme/seo] missing capability blixis.content')
  })

  it('keeps the cause and optional fields', () => {
    const cause = new Error('socket closed')
    expect(new InfrastructureError('db', { cause, retryable: true })).toMatchObject({
      cause,
      retryable: true,
    })
    expect(new RateLimitError('x', { retryAfterSeconds: 30 }).retryAfterSeconds).toBe(30)
    expect(new NotFoundError('x')).not.toHaveProperty('details')
  })
})

describe('isBlixisError', () => {
  it('rejects plain errors and non-errors', () => {
    expect(isBlixisError(new Error('x'))).toBe(false)
    expect(isBlixisError({ code: 'NOT_FOUND' })).toBe(false)
    expect(isBlixisError(null)).toBe(false)
    expect(isBlixisError('NOT_FOUND')).toBe(false)
  })

  it('accepts errors created by another copy of the package (brand via Symbol.for)', () => {
    const foreignBrand: unique symbol = Symbol.for('@blixis/contracts.error')
    class ForeignNotFound extends Error {
      readonly [foreignBrand] = true
      readonly code = 'NOT_FOUND'
      readonly expose = true
    }
    const foreign = new ForeignNotFound('elsewhere')
    expect(foreign).not.toBeInstanceOf(NotFoundError)
    expect(isBlixisError(foreign)).toBe(true)
  })
})

describe('toPublicErrorShape', () => {
  it('passes through exposed errors with details', () => {
    const issues = [{ path: ['slug'], message: 'Too long', code: 'too_big' }]
    expect(toPublicErrorShape(new ValidationError('Invalid', issues))).toEqual({
      code: 'VALIDATION_FAILED',
      message: 'Invalid',
      details: { issues },
    })
    expect(toPublicErrorShape(new NotFoundError('Entry not found'))).toEqual({
      code: 'NOT_FOUND',
      message: 'Entry not found',
    })
  })

  it('redacts infrastructure and module errors, including details', () => {
    const shape = toPublicErrorShape(
      new InfrastructureError('password authentication failed for user "app"', {
        details: { host: 'db.internal' },
      }),
    )
    expect(shape).toEqual({
      code: 'INFRASTRUCTURE_ERROR',
      message: 'A temporary error occurred. Please try again.',
    })
    expect(JSON.stringify(shape)).not.toContain('password')
    expect(toPublicErrorShape(new ModuleError('@acme/x', 'secret config')).message).not.toContain(
      'secret',
    )
  })

  it('maps unknown values to INTERNAL without leaking messages or stacks', () => {
    const shape = toPublicErrorShape(new TypeError('Cannot read properties of undefined'))
    expect(shape).toEqual({ code: 'INTERNAL', message: 'An internal error occurred.' })
    expect(toPublicErrorShape('boom')).toEqual(shape)
  })
})

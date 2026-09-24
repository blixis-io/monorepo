import { ConflictError, InfrastructureError, NotFoundError } from '@blixis/contracts'
import { DrizzleQueryError } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { translateDatabaseError } from './errors.ts'

function pgError(code: string, message: string, extra: Record<string, unknown> = {}): Error {
  return Object.assign(new Error(message), { name: 'error', code, ...extra })
}

describe('translateDatabaseError', () => {
  it('maps unique violations to ConflictError with the constraint, dropping row values', () => {
    const driver = pgError(
      '23505',
      'duplicate key value violates unique constraint "entries_slug_key"',
      {
        constraint: 'entries_slug_key',
        table: 'entries',
        schema: 'content',
        detail: 'Key (slug)=(secret-draft) already exists.',
      },
    )
    const error = translateDatabaseError(
      new DrizzleQueryError(
        'insert into "content"."entries" ...',
        ['secret-draft', 'a@b.c'],
        driver,
      ),
    )
    expect(error).toBeInstanceOf(ConflictError)
    expect(error.details).toEqual({ constraint: 'entries_slug_key' })
    const cause = error.cause as Record<string, unknown>
    expect(cause).toMatchObject({ code: '23505', constraint: 'entries_slug_key', table: 'entries' })
    const everything = JSON.stringify({
      message: error.message,
      cause,
      causeMessage: (cause as unknown as Error).message,
      details: error.details,
    })
    expect(everything).not.toMatch(/secret-draft|a@b\.c|Key \(slug\)/)
  })

  it('maps foreign-key violations to ConflictError', () => {
    expect(
      translateDatabaseError(pgError('23503', 'fk', { constraint: 'entries_space_fk' })),
    ).toBeInstanceOf(ConflictError)
  })

  it.each([
    ['40001', 'serialization'],
    ['40P01', 'deadlock'],
    ['57014', 'statement timeout'],
    ['08006', 'connection failure'],
    ['53300', 'too many connections'],
    ['ECONNREFUSED', 'connect ECONNREFUSED'],
  ])('marks %s (%s) as retryable infrastructure error', (code, message) => {
    const error = translateDatabaseError(pgError(code, message))
    expect(error).toBeInstanceOf(InfrastructureError)
    expect((error as InfrastructureError).retryable).toBe(true)
  })

  it('treats "Connection terminated" without a code as retryable', () => {
    const error = translateDatabaseError(new Error('Connection terminated unexpectedly'))
    expect((error as InfrastructureError).retryable).toBe(true)
  })

  it('maps other failures to non-retryable InfrastructureError and redacts connection strings', () => {
    const error = translateDatabaseError(
      pgError(
        '28P01',
        'password authentication failed for postgres://app:hunter2@db.neon.tech/neondb',
      ),
    )
    expect(error).toBeInstanceOf(InfrastructureError)
    expect((error as InfrastructureError).retryable).toBe(false)
    expect(error.message).toBe('Database operation failed')
    expect((error.cause as Error).message).not.toContain('hunter2')
    expect((error.cause as Error).message).toContain('[redacted connection string]')
  })

  it('passes Blixis errors through and handles non-errors', () => {
    const notFound = new NotFoundError('missing')
    expect(translateDatabaseError(notFound)).toBe(notFound)
    expect(translateDatabaseError('boom')).toBeInstanceOf(InfrastructureError)
  })
})

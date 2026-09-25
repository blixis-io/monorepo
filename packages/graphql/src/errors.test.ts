import {
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  ModuleError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '@blixis/contracts'
import {
  defineModule,
  ERROR_REPORTER,
  type ErrorReportContext,
  serviceOverride,
} from '@blixis/kernel'
import { asUser, createTestBlixis } from '@blixis/testing'
import { describe, expect, it } from 'vitest'
import { graphqlModule } from './module.ts'

const failures: Record<string, () => Error> = {
  validation: () =>
    new ValidationError('Invalid input', [{ path: ['title'], message: 'Required' }]),
  notFound: () => new NotFoundError('Entry not found'),
  conflict: () => new ConflictError('Version is stale'),
  forbidden: () => new ForbiddenError('Not allowed'),
  unauthorized: () => new UnauthorizedError('Sign in'),
  rateLimited: () => new RateLimitError('Slow down', { retryAfterSeconds: 5 }),
  module: () => new ModuleError('@acme/x', 'secret internals'),
  infrastructure: () => new InfrastructureError('db password leaked in message'),
  unexpected: () => new TypeError('cannot read x of undefined'),
}

const failing = defineModule({
  meta: { name: '@acme/failing', version: '1.0.0' },
  graphql: {
    typeDefs: `extend type Query { ${Object.keys(failures)
      .map((k) => `${k}: String`)
      .join(' ')} }`,
    resolvers: {
      Query: Object.fromEntries(
        Object.entries(failures).map(([k, make]) => [
          k,
          () => {
            throw make()
          },
        ]),
      ),
    },
  },
})

describe('GraphQL error mapping', () => {
  it('maps public errors to codes, masks internal ones, and reports only the unexpected', async () => {
    const reported: { error: unknown; context: ErrorReportContext }[] = []
    const t = await createTestBlixis({
      modules: [graphqlModule(), failing()],
      overrides: [
        serviceOverride(ERROR_REPORTER, {
          captureException: (error, context) => reported.push({ error, context }),
        }),
      ],
    })
    const res = await t.request('/graphql', {
      method: 'POST',
      actor: asUser('u1'),
      json: { query: `{ ${Object.keys(failures).join(' ')} }` },
    })
    const requestId = res.headers.get('x-request-id')
    const body = (await res.json()) as {
      errors: { message: string; path: string[]; extensions: Record<string, unknown> }[]
    }
    type GqlError = (typeof body.errors)[number]
    const byField: Record<string, GqlError> = Object.fromEntries(
      body.errors.map((e) => [e.path[0], e]),
    )
    const summary = Object.fromEntries(
      Object.entries(byField).map(([k, e]) => [k, [e.extensions['code'], e.message]]),
    )
    expect(summary).toEqual({
      validation: ['VALIDATION_FAILED', 'Invalid input'],
      notFound: ['NOT_FOUND', 'Entry not found'],
      conflict: ['CONFLICT', 'Version is stale'],
      forbidden: ['FORBIDDEN', 'Not allowed'],
      unauthorized: ['UNAUTHORIZED', 'Sign in'],
      rateLimited: ['RATE_LIMITED', 'Slow down'],
      module: ['INTERNAL', 'Unexpected error'],
      infrastructure: ['INFRASTRUCTURE_ERROR', 'A dependency is unavailable'],
      unexpected: ['INTERNAL', 'Unexpected error'],
    })
    expect(byField['validation']?.extensions['issues']).toEqual([
      { path: ['title'], message: 'Required' },
    ])
    for (const error of body.errors) expect(error.extensions['requestId']).toBe(requestId)
    expect(JSON.stringify(body)).not.toMatch(/secret|password|undefined/)
    expect(reported.map((r) => (r.error as Error).message).sort()).toEqual([
      '[@acme/x] secret internals',
      'cannot read x of undefined',
      'db password leaked in message',
    ])
    expect(reported[0]?.context).toMatchObject({ requestId, actorType: 'user', route: '/graphql' })
    expect(t.logs.entries.filter((e) => e.message === 'graphql resolver failed')).toHaveLength(3)
  })

  it('keeps GraphQL validation errors as they are, with the request id', async () => {
    const t = await createTestBlixis({ modules: [graphqlModule()] })
    const res = await t.request('/graphql', {
      method: 'POST',
      actor: asUser('u1'),
      json: { query: '{ nope }' },
    })
    const body = (await res.json()) as {
      errors: { message: string; extensions?: Record<string, unknown> }[]
    }
    expect(body.errors[0]?.message).toContain('Cannot query field "nope"')
  })
})

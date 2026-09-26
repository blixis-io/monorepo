import { ModuleValidationError } from '@blixis/kernel'
import { graphql } from 'graphql'
import { describe, expect, it } from 'vitest'
import { composeSchema, type SchemaPart } from './compose.ts'

const base: SchemaPart = {
  module: '@acme/base',
  typeDefs: 'type Query { ping: String! } type Author { name: String! }',
  resolvers: { Query: { ping: () => 'pong' } } as never,
}
const problems = (parts: SchemaPart[]) => {
  try {
    composeSchema(parts)
    return []
  } catch (error) {
    expect(error).toBeInstanceOf(ModuleValidationError)
    return (error as ModuleValidationError).problems.map((p) => `[${p.module}] ${p.message}`)
  }
}

describe('composeSchema', () => {
  it('merges extensions from several modules and provides shared scalars', async () => {
    const schema = composeSchema([
      base,
      {
        module: '@acme/books',
        typeDefs:
          'extend type Query { book: Book } type Book { title: String! published: Date at: DateTime lang: Locale meta: JSON }',
        resolvers: {
          Query: {
            book: () => ({
              title: 'Dune',
              published: '1965-08-01',
              at: '2026-09-25T10:00:00Z',
              lang: 'en-US',
              meta: { a: [1] },
            }),
          },
        } as never,
      },
    ])
    const result = await graphql({
      schema,
      source: '{ ping book { title published at lang meta } }',
    })
    expect(result).toEqual({
      data: {
        ping: 'pong',
        book: {
          title: 'Dune',
          published: '1965-08-01',
          at: '2026-09-25T10:00:00Z',
          lang: 'en-US',
          meta: { a: [1] },
        },
      },
    })
  })

  it('ignores empty fragments', async () => {
    const schema = composeSchema([
      base,
      { module: '@acme/empty', typeDefs: '  ' },
      { module: '@acme/none', typeDefs: [] },
    ])
    expect((await graphql({ schema, source: '{ ping }' })).data).toEqual({ ping: 'pong' })
  })

  it('rejects invalid scalar values', async () => {
    const schema = composeSchema([
      base,
      {
        module: '@acme/x',
        typeDefs: 'extend type Query { at: DateTime }',
        resolvers: { Query: { at: () => 'yesterday' } } as never,
      },
    ])
    const result = await graphql({ schema, source: '{ at }' })
    expect(result.errors?.[0]?.message).toContain('Invalid DateTime')
  })

  it('names the module behind every problem', () => {
    expect(
      problems([
        base,
        { module: '@acme/dup', typeDefs: 'type Author { id: ID! }' },
        { module: '@acme/field', typeDefs: 'extend type Query { ping: Int }' },
        { module: '@acme/syntax', typeDefs: 'type {' },
      ]),
    ).toEqual([
      '[@acme/dup] type Author is already defined by @acme/base',
      '[@acme/field] field Query.ping is already defined by @acme/base',
      '[@acme/syntax] invalid GraphQL SDL: Syntax Error: Expected Name, found "{".',
    ])
    expect(
      problems([
        base,
        {
          module: '@acme/orphan',
          typeDefs: 'extend type Query { lonely: String }',
          resolvers: { Query: { missing: () => 1 }, Ghost: { x: () => 1 } } as never,
        },
      ]),
    ).toEqual([
      '[@acme/orphan] resolver Query.missing has no field in the schema',
      '[@acme/orphan] resolvers for unknown type Ghost',
      '[@acme/orphan] Query.lonely has no resolver',
    ])
  })
})

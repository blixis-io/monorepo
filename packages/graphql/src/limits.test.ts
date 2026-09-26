import { defineModule } from '@blixis/kernel'
import { asDeliveryKey, asUser, createTestBlixis, type TestBlixis } from '@blixis/testing'
import { describe, expect, it } from 'vitest'
import { graphqlModule } from './module.ts'

const tree = defineModule({
  meta: { name: '@acme/tree', version: '1.0.0' },
  graphql: {
    typeDefs:
      'type Node { name: String! children(limit: Int): [Node!]! } extend type Query { root: Node! nodeCollection(limit: Int): [Node!]! }',
    resolvers: {
      Query: { root: () => ({ name: 'root' }), nodeCollection: () => [] },
      Node: { children: () => [] },
    },
  },
})

async function setup(limits = {}) {
  return createTestBlixis({ modules: [graphqlModule({ limits }), tree()] })
}
async function run(t: TestBlixis, query: string, actor = asUser('u1') as never) {
  const res = await t.request('/graphql', { method: 'POST', actor, json: { query } })
  return {
    status: res.status,
    body: (await res.json()) as {
      data?: unknown
      errors?: { message: string; extensions?: { code?: string } }[]
    },
  }
}
const nested = (levels: number) =>
  `{ root { ${'children { '.repeat(levels)}name${' }'.repeat(levels)} } }`

describe('query limits', () => {
  it('rejects queries that are too deep', async () => {
    const t = await setup({ maxDepth: 5 })
    expect((await run(t, nested(3))).body.errors).toBeUndefined()
    const deep = await run(t, nested(6))
    expect(deep.body.errors?.[0]).toMatchObject({ extensions: { code: 'QUERY_TOO_COMPLEX' } })
    expect(deep.body.errors?.[0]?.message).toContain('levels deep; the limit is 5')
  })

  it('counts aliases and estimated cost, including fragments', async () => {
    const t = await setup({ maxAliases: 2, maxCost: 1000 })
    const aliases = await run(t, '{ a: root { name } b: root { name } c: root { name } }')
    expect(aliases.body.errors?.[0]?.message).toContain('3 aliases')
    // 100 × 100 names: far above 1000.
    const costly = await run(
      t,
      '{ nodeCollection(limit: 100) { ...N } } fragment N on Node { children(limit: 100) { name } }',
    )
    expect(costly.body.errors?.[0]?.message).toContain('may return about')
    expect(
      (await run(t, '{ nodeCollection(limit: 5) { children(limit: 5) { name } } }')).body.errors,
    ).toBeUndefined()
  })

  it('limits tokens and body size', async () => {
    const t = await setup({ maxTokens: 50, maxBodyBytes: 2000 })
    const tokens = await run(
      t,
      `{ ${Array.from({ length: 40 }, () => 'root { name }').join(' ')} }`,
    )
    expect(tokens.body.errors?.[0]?.message).toContain('more that 50 tokens')
    const big = await t.request('/graphql', {
      method: 'POST',
      actor: asUser('u1'),
      json: { query: '{ root { name } }', variables: { padding: 'x'.repeat(5000) } },
    })
    expect(big.status).toBe(413)
    expect(
      ((await big.json()) as { errors: { extensions: { code: string } }[] }).errors[0]?.extensions
        .code,
    ).toBe('PAYLOAD_TOO_LARGE')
  })

  it('can restrict introspection to members', async () => {
    const t = await setup({ introspection: 'members' })
    const query = '{ __schema { queryType { name } } }'
    expect((await run(t, query)).body.errors).toBeUndefined()
    const key = await run(t, query, asDeliveryKey({ organizationId: 'o', spaceId: 's' }) as never)
    expect(key.body.errors?.[0]?.message).toContain('introspection')
  })
})

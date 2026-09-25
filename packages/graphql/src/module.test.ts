import { defineModule } from '@blixis/kernel'
import { asUser, createTestBlixis } from '@blixis/testing'
import { describe, expect, it } from 'vitest'
import type { GraphQLContext } from './context.ts'
import { graphqlModule } from './module.ts'

const greeter = defineModule({
  meta: { name: '@acme/greeter', version: '1.2.3' },
  graphql: {
    typeDefs: 'extend type Query { hello(name: String!): String! whoami: String! }',
    resolvers: {
      Query: {
        hello: (_p: unknown, args: { name: string }) => `Hello, ${args.name}`,
        whoami: (_p: unknown, _a: unknown, context: GraphQLContext) =>
          context.requestContext.actor.type,
      },
    },
  },
})

async function post(
  t: Awaited<ReturnType<typeof createTestBlixis>>,
  query: string,
  actor = asUser('u1'),
) {
  const res = await t.request('/graphql', { method: 'POST', actor, json: { query } })
  return {
    status: res.status,
    body: (await res.json()) as { data?: Record<string, unknown>; errors?: unknown[] },
  }
}

describe('graphqlModule', () => {
  it('composes module contributions and passes the kernel request context', async () => {
    const t = await createTestBlixis({ modules: [graphqlModule(), greeter()] })
    const { body } = await post(
      t,
      '{ hello(name: "Ada") whoami _platform { version modules { name version } } }',
    )
    expect(body.data).toEqual({
      hello: 'Hello, Ada',
      whoami: 'user',
      _platform: {
        version: 'local',
        modules: [
          { name: '@blixis/graphql', version: '0.0.0' },
          { name: '@acme/greeter', version: '1.2.3' },
        ],
      },
    })
  })

  it('serves GraphiQL outside production only', async () => {
    const t = await createTestBlixis({ modules: [graphqlModule()] })
    const page = await t.request('/graphql', { headers: { accept: 'text/html' } })
    expect(page.headers.get('content-type')).toContain('text/html')
    const off = await createTestBlixis({ modules: [graphqlModule({ graphiql: false })] })
    const blocked = await off.request('/graphql', { headers: { accept: 'text/html' } })
    expect(blocked.headers.get('content-type') ?? '').not.toContain('text/html')
  })
})

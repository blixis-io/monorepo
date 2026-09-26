import {
  defineModule,
  ERROR_REPORTER,
  ModuleValidationError,
  serviceOverride,
} from '@blixis/kernel'
import { asUser, createTestBlixis } from '@blixis/testing'
import { describe, expect, it } from 'vitest'
import type { GraphQLContext } from './context.ts'
import { GRAPHQL_SCHEMA_EXTENSION, type SchemaExtensionProvider } from './extensions.ts'
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

  it('fails setup with the module named when contributions conflict', async () => {
    const clash = defineModule({
      meta: { name: '@acme/clash', version: '1.0.0' },
      graphql: {
        typeDefs: 'extend type Query { hello(name: String!): String! }',
        resolvers: { Query: { hello: () => 'x' } },
      },
    })
    const t = await createTestBlixis({ modules: [graphqlModule(), greeter(), clash()] }).catch(
      (e: unknown) => e,
    )
    expect(t).toBeInstanceOf(ModuleValidationError)
    expect(String(t)).toContain(
      '[@acme/clash] field Query.hello is already defined by @acme/greeter',
    )
  })

  it('extends the schema per request through GRAPHQL_SCHEMA_EXTENSION, cached by key', async () => {
    let builds = 0
    const extension = defineModule({
      meta: { name: '@acme/dynamic', version: '1.0.0' },
      setup(ctx) {
        ctx.services.provideFactory(
          GRAPHQL_SCHEMA_EXTENSION,
          (): SchemaExtensionProvider => async (context) => {
            const tenant =
              context.requestContext.actor.type === 'user'
                ? context.requestContext.actor.userId
                : 'none'
            if (tenant === 'none') return undefined
            return {
              key: tenant,
              get parts() {
                builds++
                return [
                  {
                    module: '@acme/dynamic',
                    typeDefs: `extend type Query { tenant: String! }`,
                    resolvers: { Query: { tenant: () => tenant } } as never,
                  },
                ]
              },
            }
          },
          { scope: 'request' },
        )
      },
    })
    const t = await createTestBlixis({ modules: [graphqlModule(), extension()] })
    expect((await post(t, '{ tenant }', asUser('alice'))).body.data).toEqual({ tenant: 'alice' })
    expect((await post(t, '{ tenant }', asUser('alice'))).body.data).toEqual({ tenant: 'alice' })
    expect((await post(t, '{ tenant }', asUser('bob'))).body.data).toEqual({ tenant: 'bob' })
    expect(builds).toBe(2)
  })

  it('reports a failing schema extension instead of masking it silently', async () => {
    const reported: unknown[] = []
    const broken = defineModule({
      meta: { name: '@acme/broken', version: '1.0.0' },
      setup(ctx) {
        ctx.services.provideFactory(
          GRAPHQL_SCHEMA_EXTENSION,
          (): SchemaExtensionProvider => async () => ({
            key: 'broken',
            parts: [{ module: '@acme/broken', typeDefs: 'type {' }],
          }),
          { scope: 'request' },
        )
      },
    })
    const t = await createTestBlixis({
      modules: [graphqlModule(), broken()],
      overrides: [
        serviceOverride(ERROR_REPORTER, { captureException: (error) => reported.push(error) }),
      ],
    })
    const { body } = await post(t, '{ _platform { version } }')
    expect(body.errors).toEqual([
      expect.objectContaining({
        message: 'Unexpected error',
        extensions: expect.objectContaining({ code: 'INTERNAL' }),
      }),
    ])
    expect(String(reported[0])).toContain('invalid GraphQL SDL')
    expect(t.logs.entries.some((e) => e.message === 'graphql schema selection failed')).toBe(true)
  })
})

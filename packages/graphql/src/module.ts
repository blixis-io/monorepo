import type { ModuleHonoEnv, ModuleMeta } from '@blixis/contracts'
import { defineModule, KERNEL_CONTRIBUTIONS } from '@blixis/kernel'
import { createSchema, createYoga, type YogaServerInstance } from 'graphql-yoga'
import { Hono } from 'hono'
import type { GraphQLContext } from './context.ts'

/** Options for {@link graphqlModule}. */
export interface GraphqlModuleOptions {
  /**
   * Serve GraphiQL on `GET /graphql` in browsers. Default: everywhere except where the Worker's
   * `BLIXIS_ENV` is `production`.
   */
  readonly graphiql?: boolean
}

const PLATFORM_TYPE_DEFS = /* GraphQL */ `
  type Query {
    "The running platform: deployed version and installed modules."
    _platform: Platform!
  }

  type Platform {
    "Deployed Worker version id, or 'local'."
    version: String!
    modules: [PlatformModule!]!
  }

  type PlatformModule {
    name: String!
    version: String!
  }
`

type ServerContext = GraphQLContext & { readonly env: Readonly<Record<string, unknown>> }

/**
 * The GraphQL platform module (§10, plan 012): one `/graphql` endpoint served by GraphQL Yoga
 * inside the API Worker. Modules contribute `graphql: { typeDefs, resolvers }`; this module
 * composes them — modules never create servers. Requests pass through the same kernel
 * middleware as REST: actor resolution, request scope, request ids.
 */
export const graphqlModule = defineModule((options: GraphqlModuleOptions) => {
  let modules: readonly ModuleMeta[] = []
  let yoga: YogaServerInstance<ServerContext, object> | undefined

  return {
    meta: { name: '@blixis/graphql', version: '0.0.0' },
    setup(ctx) {
      const contributions = ctx.services.get(KERNEL_CONTRIBUTIONS).graphql
      const schema = createSchema<ServerContext>({
        typeDefs: [PLATFORM_TYPE_DEFS, ...contributions.flatMap(({ value }) => value.typeDefs)],
        resolvers: [
          {
            Query: {
              _platform: (_parent: unknown, _args: unknown, context: ServerContext) => ({
                version:
                  (context.env['CF_VERSION_METADATA'] as { id?: string } | undefined)?.id ??
                  'local',
                modules: modules.map((m) => ({ name: m.name, version: m.version })),
              }),
            },
          },
          ...contributions.flatMap(({ value }) =>
            value.resolvers === undefined ? [] : [value.resolvers],
          ),
        ] as never,
      })
      yoga = createYoga<ServerContext>({
        schema,
        graphqlEndpoint: '/graphql',
        maskedErrors: true,
        landingPage: false,
        graphiql: (_request, context) =>
          options.graphiql ?? context?.env['BLIXIS_ENV'] !== 'production',
        logging: false,
      })
    },
    boot(ctx) {
      modules = ctx.modules
    },
    rest: {
      path: '/graphql',
      root: true,
      app: new Hono<ModuleHonoEnv>().all('/', async (c) => {
        if (yoga === undefined) throw new Error('graphqlModule is not set up')
        const context: ServerContext = {
          requestContext: c.var.requestContext,
          services: c.var.services,
          loaders: new Map(),
          env: (c.env ?? {}) as Readonly<Record<string, unknown>>,
        }
        return yoga.fetch(c.req.raw, context)
      }),
    },
  }
})

import type { ModuleHonoEnv, ModuleMeta } from '@blixis/contracts'
import { BlixisError } from '@blixis/contracts'
import { defineModule, KERNEL_CONTRIBUTIONS } from '@blixis/kernel'
import { GraphQLError, type GraphQLSchema } from 'graphql'
import { createYoga, type YogaServerInstance } from 'graphql-yoga'
import { Hono } from 'hono'
import { composeSchema, type SchemaPart } from './compose.ts'
import type { GraphQLContext } from './context.ts'
import { mapGraphQLError, useBlixisErrors } from './errors.ts'
import { GRAPHQL_SCHEMA_EXTENSION, type SchemaExtensionProvider } from './extensions.ts'
import { DEFAULT_LIMITS, type GraphqlLimits, useLimits } from './limits.ts'

/** Options for {@link graphqlModule}. */
export interface GraphqlModuleOptions {
  /**
   * Serve GraphiQL on `GET /graphql` in browsers. Default: everywhere except where the Worker's
   * `BLIXIS_ENV` is `production`.
   */
  readonly graphiql?: boolean
  /** How many extended schemas (e.g. one per space content model) to keep per isolate. Default 50. */
  readonly schemaCacheSize?: number
  /** Query limits (depth, aliases, tokens, cost, body size, introspection). */
  readonly limits?: GraphqlLimits
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
      const platform: SchemaPart = {
        module: '@blixis/graphql',
        typeDefs: PLATFORM_TYPE_DEFS,
        resolvers: {
          Query: {
            _platform: (_parent: unknown, _args: unknown, context: ServerContext) => ({
              version:
                (context.env['CF_VERSION_METADATA'] as { id?: string } | undefined)?.id ?? 'local',
              modules: modules.map((m) => ({ name: m.name, version: m.version })),
            }),
          },
        } as never,
      }
      const parts: SchemaPart[] = [
        platform,
        ...ctx.services.get(KERNEL_CONTRIBUTIONS).graphql.map(({ module, value }) => ({
          module,
          typeDefs: value.typeDefs,
          resolvers: value.resolvers as never,
        })),
      ]
      // Static contributions compose once per isolate; problems fail setup, naming the module.
      const staticSchema = composeSchema(parts)
      const extended = new Map<string, GraphQLSchema>()
      const capacity = options.schemaCacheSize ?? 50
      const schemaFor = async (context: ServerContext): Promise<GraphQLSchema> => {
        let extension: Awaited<ReturnType<SchemaExtensionProvider>>
        try {
          extension = await context.services.getOptional(GRAPHQL_SCHEMA_EXTENSION)?.(context)
        } catch (error) {
          // Choosing the schema happens before execution: map public errors (unknown space,
          // missing permission) like resolver errors instead of letting Yoga mask them.
          if (!(error instanceof BlixisError)) throw error
          throw mapGraphQLError(
            new GraphQLError(error.message, { originalError: error }),
            context.requestContext.requestId,
          ).error
        }
        if (extension === undefined) return staticSchema
        let schema = extended.get(extension.key)
        if (schema === undefined) {
          schema = composeSchema([...parts, ...extension.parts])
          extended.set(extension.key, schema)
          if (extended.size > capacity) extended.delete(extended.keys().next().value as string)
        } else {
          extended.delete(extension.key)
          extended.set(extension.key, schema)
        }
        return schema
      }
      yoga = createYoga<ServerContext>({
        schema: (context) => schemaFor(context),
        graphqlEndpoint: '/graphql',
        // Errors are mapped by useBlixisErrors (public errors keep their message and code);
        // Yoga's masking stays on as a last line of defence for anything that slips through.
        maskedErrors: true,
        plugins: [useLimits(options.limits) as never, useBlixisErrors() as never],
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
          responseHeaders: new Headers(),
          env: (c.env ?? {}) as Readonly<Record<string, unknown>>,
        }
        const maxBytes = options.limits?.maxBodyBytes ?? DEFAULT_LIMITS.maxBodyBytes
        const length = Number(c.req.header('content-length') ?? 0)
        const body =
          c.req.method === 'POST' ? await c.req.raw.clone().arrayBuffer() : new ArrayBuffer(0)
        if (length > maxBytes || body.byteLength > maxBytes) {
          return c.json(
            {
              errors: [
                {
                  message: `Request body exceeds ${maxBytes} bytes`,
                  extensions: {
                    code: 'PAYLOAD_TOO_LARGE',
                    requestId: context.requestContext.requestId,
                  },
                },
              ],
            },
            413,
          )
        }
        const response = await yoga.fetch(c.req.raw, context)
        for (const [name, value] of context.responseHeaders) response.headers.set(name, value)
        return response
      }),
    },
  }
})

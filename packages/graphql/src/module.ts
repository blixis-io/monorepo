import type { ModuleHonoEnv, ModuleMeta } from '@blixis/contracts'
import { BlixisError } from '@blixis/contracts'
import { defineModule, ERROR_REPORTER, KERNEL_CONTRIBUTIONS } from '@blixis/kernel'
import { useAPQ } from '@graphql-yoga/plugin-apq'
import { GraphQLError, type GraphQLSchema } from 'graphql'
import { createYoga, type YogaServerInstance } from 'graphql-yoga'
import { Hono } from 'hono'
import { createMemoryResponseCache, createTieredCache, type ResponseCacheStore } from './cache.ts'
import { composeSchema, type SchemaPart } from './compose.ts'
import type { GraphQLContext } from './context.ts'
import { mapGraphQLError, useBlixisErrors } from './errors.ts'
import { GRAPHQL_SCHEMA_EXTENSION } from './extensions.ts'
import { DEFAULT_LIMITS, type GraphqlLimits, useLimits } from './limits.ts'
import {
  cacheHeaders,
  cacheKey,
  etagOf,
  GRAPHQL_CACHE_POLICY,
  readOperation,
  storable,
} from './response-cache.ts'

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
  /**
   * Response caching of requests a `GRAPHQL_CACHE_POLICY` allows (ADR 0012). Default: an
   * isolate-memory L1 for 5 minutes; add an L2 such as `createCacheApiStore()` from
   * `@blixis/cloudflare`.
   */
  readonly cache?: {
    readonly stores?: readonly { readonly store: ResponseCacheStore; readonly ttlSeconds: number }[]
    /** `max-age` for clients and CDNs, in seconds. Default 0 (revalidate every time via ETag). */
    readonly maxAge?: number
  }
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
  let cached: ((request: Request, context: ServerContext) => Promise<Response>) | undefined

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
      const selectSchema = async (context: ServerContext): Promise<GraphQLSchema> => {
        const extension = await context.services.getOptional(GRAPHQL_SCHEMA_EXTENSION)?.(context)
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
      // Choosing the schema happens before execution, outside useBlixisErrors: map public errors
      // (unknown space, missing permission) the same way, and log and report the unexpected ones
      // (e.g. a generated schema that fails to compose) instead of letting Yoga mask them silently.
      const schemaFor = async (context: ServerContext): Promise<GraphQLSchema> => {
        try {
          return await selectSchema(context)
        } catch (error) {
          const { requestContext, services } = context
          const mapped = mapGraphQLError(
            error instanceof GraphQLError
              ? error
              : new GraphQLError('schema selection failed', { originalError: error as Error }),
            requestContext.requestId,
          )
          if (mapped.unexpected || !(error instanceof BlixisError)) {
            requestContext.logger.error('graphql schema selection failed', {
              error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
            })
            try {
              services.getOptional(ERROR_REPORTER)?.captureException(error, {
                requestId: requestContext.requestId,
                correlationId: requestContext.correlationId,
                actorType: requestContext.actor.type,
                route: '/graphql',
              })
            } catch {
              // Error reporting must never break the response.
            }
          }
          throw mapped.error
        }
      }
      yoga = createYoga<ServerContext>({
        schema: (context) => schemaFor(context),
        graphqlEndpoint: '/graphql',
        // Errors are mapped by useBlixisErrors (public errors keep their message and code);
        // Yoga's masking stays on as a last line of defence for anything that slips through.
        maskedErrors: true,
        plugins: [
          useAPQ() as never,
          useLimits(options.limits) as never,
          useBlixisErrors() as never,
        ],
        landingPage: false,
        graphiql: (_request, context) =>
          options.graphiql ?? context?.env['BLIXIS_ENV'] !== 'production',
        logging: false,
      })
      const stores = options.cache?.stores ?? [
        { store: createMemoryResponseCache(), ttlSeconds: 300 },
      ]
      const tiered = createTieredCache(stores)
      const maxAge = options.cache?.maxAge ?? 0
      const execute = async (request: Request, context: ServerContext) => {
        const response = await (yoga as NonNullable<typeof yoga>).fetch(request, context)
        for (const [name, value] of context.responseHeaders) response.headers.set(name, value)
        return response
      }
      /** Serves cacheable requests from the response cache (ADR 0012); the rest bypasses it. */
      cached = async (request, context) => {
        const policy = context.services.getOptional(GRAPHQL_CACHE_POLICY)
        let scope: string | undefined
        try {
          scope = policy === undefined ? undefined : await policy({ ...context, request })
        } catch {
          scope = undefined // Let execution report the problem (e.g. unknown space).
        }
        const operation = scope === undefined ? undefined : await readOperation(request)
        if (scope === undefined || operation === undefined) {
          const response = await execute(request, context)
          response.headers.set('x-blixis-cache', 'BYPASS')
          return response
        }
        const key = await cacheKey(scope, operation)
        // `Cache-Control: no-cache` skips the lookup (debugging, hard reloads); the fresh result is stored.
        const refresh = (request.headers.get('cache-control') ?? '').includes('no-cache')
        const found = refresh ? undefined : await tiered.lookup(key)
        if (found !== undefined) {
          const hit = found.value
          const headers = cacheHeaders(hit, 'HIT', maxAge)
          headers.set('x-blixis-cache-layer', found.layer)
          if (request.headers.get('if-none-match') === hit.etag)
            return new Response(null, { status: 304, headers })
          return new Response(hit.body, { status: 200, headers })
        }
        const response = await execute(request, context)
        const body = await response.text()
        if (!storable(response, body)) {
          const headers = new Headers(response.headers)
          headers.set('x-blixis-cache', 'BYPASS')
          return new Response(body, { status: response.status, headers })
        }
        const value = {
          body,
          contentType: response.headers.get('content-type') ?? 'application/json',
          etag: await etagOf(body),
        }
        await tiered.put(key, value, 0)
        return new Response(body, { status: 200, headers: cacheHeaders(value, 'MISS', maxAge) })
      }
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
        if (cached === undefined) throw new Error('graphqlModule is not set up')
        return cached(c.req.raw, context)
      }),
    },
  }
})

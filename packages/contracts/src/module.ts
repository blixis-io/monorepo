import type { Hono, Schema } from 'hono'
import type { CapabilityId } from './capabilities.ts'
import type { Logger, RequestContext } from './context.ts'
import type { EventSubscription } from './events.ts'
import type { MigrationDefinition } from './migrations.ts'
import type { PermissionDefinition } from './permissions.ts'
import type { ServiceProvider, ServiceRegistry } from './services.ts'
import type { StandardSchemaV1 } from './standard-schema.ts'

/** Identity and dependency metadata of a module (architecture §5). */
export interface ModuleMeta {
  /**
   * Module name: a stable identifier, unique in an app (migrations are recorded under it). Usually
   * the package name, e.g. `@acme/blixis-seo`; first-party modules keep `@blixis/content` etc.
   * although their packages are `@blixis-io/content` (ADR 0020).
   */
  readonly name: string
  /** Semantic version of the module package. */
  readonly version: string
  readonly description?: string
  /** Required module packages: package name → semver range (§26). Prefer capabilities. */
  readonly requires?: Readonly<Record<string, string>>
  /** Capabilities this module provides (§8). */
  readonly capabilities?: readonly CapabilityId[]
  /** Capabilities this module needs from some other module (§8). */
  readonly requiresCapabilities?: readonly CapabilityId[]
}

/**
 * Hono environment of module REST routes. Handlers read the request context and services from
 * `c.var`; there are no `Bindings` — domain code never touches Cloudflare `env` (§19).
 */
export interface ModuleHonoEnv {
  Variables: {
    /** Context of the current request; pass it to services. */
    requestContext: RequestContext
    /** Request-scoped services (same as `requestContext.services`). */
    services: ServiceRegistry
  }
}

/** A Hono app contributed by a module. Create it with `new Hono<ModuleHonoEnv>()`. */
export type ModuleRestApp = Hono<ModuleHonoEnv, Schema, string>

/** REST routes of a module, mounted by the kernel at `/api/v1${path}` (§9). */
export interface RestContribution {
  /** Mount path starting with `/`, e.g. `/content`. Several modules may share a prefix. */
  readonly path: string
  readonly app: ModuleRestApp
  /**
   * Mount at the site root instead of `/api/v1` — only for platform endpoints outside the
   * Management API, such as `/graphql` (§45). The same request middleware (request id, actor,
   * request scope, error mapping) applies. Default `false`.
   */
  readonly root?: boolean
  /**
   * Machine-readable description of the routes (plan 017, ADR 0015): the source of the OpenAPI
   * document and the SDK's types. Paths are relative to where the app is mounted, in Hono syntax
   * (`/spaces/:spaceId/entries`).
   */
  readonly operations?: readonly RestOperation[]
}

/** One documented HTTP operation of a {@link RestContribution}. */
export interface RestOperation {
  readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Hono path relative to the contribution, e.g. `/entries/:entryId/publish`. */
  readonly path: string
  /** Stable identifier, e.g. `publishEntry` (SDK method and OpenAPI `operationId`). */
  readonly id: string
  readonly summary: string
  readonly description?: string
  /** Groups operations in the reference, e.g. `Entries`. */
  readonly tag: string
  /** Permission the service checks, if any (documentation only). */
  readonly permission?: string
  /** `false` for public operations (sign-in, health). Default: a bearer token is needed. */
  readonly auth?: boolean
  readonly request?: {
    /** Query parameters: an object schema. */
    readonly query?: StandardSchemaV1
    /** JSON body, or `'binary'` for a raw file body (uploads). */
    readonly body?: StandardSchemaV1 | 'binary'
    /** Request headers the operation reads, e.g. `{ 'If-Match': 'Current version, "3"' }`. */
    readonly headers?: Readonly<Record<string, string>>
    /** Supports `Idempotency-Key`. */
    readonly idempotent?: boolean
  }
  /** Responses by status; `schema` is omitted for empty bodies (204). */
  readonly responses: Readonly<
    Record<number, { readonly description: string; readonly schema?: StandardSchemaV1 }>
  >
}

/** A GraphQL resolver function. `TContext` is provided by `@blixis/graphql` (plan 012). */
export type GraphQLFieldResolver<TContext = unknown> = (
  parent: unknown,
  args: Readonly<Record<string, unknown>>,
  context: TContext,
  info: unknown,
) => unknown

/** Resolvers per GraphQL type name and field name. */
export type GraphQLResolverMap<TContext = unknown> = Readonly<
  Record<string, Readonly<Record<string, GraphQLFieldResolver<TContext> | unknown>>>
>

/**
 * What every GraphQL resolver receives as its context (provided by `@blixis/graphql`, §10).
 * Resolvers stay thin: read the actor and tenant from `requestContext` and call services.
 *
 * @example
 * const resolvers: GraphQLResolverMap<GraphQLResolverContext> = {
 *   Sys: { seo: (parent, _args, context) => context.services.get(SEO_SERVICE).forEntry((parent as { id: string }).id) },
 * }
 */
export interface GraphQLResolverContext {
  /** Actor, tenant, request id, logger — the same context REST handlers get. */
  readonly requestContext: RequestContext
  /** Services of this request's scope. */
  readonly services: ServiceRegistry
  /**
   * Per-request memo for batching loaders, keyed by the owning module (e.g. `@acme/seo.loader`).
   * Dropped with the request.
   */
  readonly loaders: Map<string, unknown>
  /** Headers to add to the HTTP response, e.g. `Cache-Control: private, no-store`. */
  readonly responseHeaders: Headers
}

/**
 * GraphQL schema fragment and resolvers contributed by a module (§10). The platform composes
 * all contributions into one schema; modules never create their own server.
 */
export interface GraphQLContribution<TContext = unknown> {
  /** SDL, e.g. `type Entry { … } extend type Query { entry(id: ID!): Entry }`. */
  readonly typeDefs: string | readonly string[]
  readonly resolvers?: GraphQLResolverMap<TContext>
}

/** Context passed to `setup`. Register services here; do not perform I/O (Workers forbid it). */
export interface ModuleSetupContext<TConfig = unknown> {
  readonly meta: ModuleMeta
  /** Configuration validated against the module's `configSchema`. */
  readonly config: TConfig
  /** Register services (`provide`, `provideFactory`) and resolve ones registered earlier. */
  readonly services: ServiceRegistry & ServiceProvider
  /** Logger bound to `{ module: meta.name }`. */
  readonly logger: Logger
}

/** Context passed to `boot`, which runs once, lazily, before the first request or event. */
export interface ModuleBootContext {
  readonly meta: ModuleMeta
  readonly services: ServiceRegistry
  readonly logger: Logger
  /** Metadata of all registered modules, in bootstrap order. */
  readonly modules: readonly ModuleMeta[]
}

/**
 * The module contract (§5). First-party and third-party modules implement it identically
 * (§2.2). Lifecycle: validate → `setup` (register) → `boot` (lazy) → ready (§27).
 */
export interface BlixisModule<TConfig = unknown> {
  readonly meta: ModuleMeta
  /** Raw configuration from the module factory; validated by the kernel with `configSchema`. */
  readonly config?: unknown
  /** Schema for `config` (any Standard Schema library, e.g. Zod). Output becomes `ctx.config`. */
  readonly configSchema?: StandardSchemaV1<unknown, TConfig>
  /**
   * Registers services. Declared as a method (bivariant) so modules with different config types
   * can be listed together as `readonly BlixisModule[]`.
   */
  setup?(context: ModuleSetupContext<TConfig>): void | Promise<void>
  /** Runs once, lazily, before the first request or event. */
  boot?(context: ModuleBootContext): void | Promise<void>
  /**
   * REST routes: one contribution, or several (e.g. Management API routes plus a root-level
   * delivery route).
   */
  readonly rest?: RestContribution | readonly RestContribution[]
  readonly graphql?: GraphQLContribution
  readonly permissions?: readonly PermissionDefinition[]
  /** Event subscriptions; handlers must be idempotent (§33). */
  readonly events?: readonly EventSubscription[]
  readonly migrations?: readonly MigrationDefinition[]
}

/**
 * A module factory — what module packages default-export. Consumers call it in the
 * composition root: `modules: [content(), seo({ defaultTitle: 'x' })]` (§6).
 */
export type ModuleFactory<TOptions = void, TConfig = unknown> = TOptions extends void
  ? () => BlixisModule<TConfig>
  : (options?: TOptions) => BlixisModule<TConfig>

/**
 * `true` when a schema's output type and a hand-written type describe the same shape — used by
 * modules to keep operation schemas (ADR 0015) and their service types from drifting:
 * `const check: SameShape<z.output<typeof entrySchema>, EntryView> = true`.
 */
export type SameShape<A, B> = [Plain<A>] extends [Plain<B>]
  ? [Plain<B>] extends [Plain<A>]
    ? true
    : false
  : false

/** `T` as JSON sees it: no `readonly`, no `undefined` in properties — recursively. */
type Plain<T> = T extends readonly (infer U)[]
  ? Plain<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Plain<Exclude<T[K], undefined>> }
    : T

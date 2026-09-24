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
  /** Package name, e.g. `@blixis/content` or `@acme/blixis-seo`. Must be unique in an app. */
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
  readonly setup?: (context: ModuleSetupContext<TConfig>) => void | Promise<void>
  readonly boot?: (context: ModuleBootContext) => void | Promise<void>
  readonly rest?: RestContribution
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

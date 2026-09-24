/**
 * Typed service token. Identifies a service in the registry and carries its type `T`.
 *
 * Tokens with the same `name` are interchangeable at runtime (`id` is `Symbol.for(name)`),
 * so duplicated package instances still resolve the same service. Name tokens after the
 * owning package: `@blixis/content.service`.
 */
export interface ServiceToken<T> {
  readonly id: symbol
  readonly name: string
  /**
   * Phantom field that carries `T` at the type level only; never set at runtime.
   * It makes `ServiceToken<string>` and `ServiceToken<number>` incompatible.
   * @internal
   */
  readonly __service?: (value: T) => T
}

/** Creates a typed service token (architecture §7). */
export function createServiceToken<T>(name: string): ServiceToken<T> {
  return Object.freeze({ id: Symbol.for(name), name })
}

/**
 * A service token of any service type. Tokens are invariant in `T`, so use this for APIs that
 * accept tokens without caring about the service type (e.g. `has`).
 */
export type AnyServiceToken = Pick<ServiceToken<unknown>, 'id' | 'name'>

/** Extracts the service type from a token. */
export type ServiceOf<TToken> = TToken extends ServiceToken<infer T> ? T : never

/** Read access to registered services. */
export interface ServiceRegistry {
  /**
   * Returns the service for `token`.
   * @throws ModuleError when no provider is registered.
   */
  get<T>(token: ServiceToken<T>): T
  /** Returns the service for `token`, or `undefined` when none is registered. */
  getOptional<T>(token: ServiceToken<T>): T | undefined
  /** Whether a provider is registered for `token`. */
  has(token: AnyServiceToken): boolean
}

/**
 * Lifetime of a service instance (ADR 0005):
 * - `app`: created once per isolate; must not hold per-request I/O objects.
 * - `request`: created at most once per request/event scope and disposed when the scope ends
 *   (e.g. database clients — Workers cannot share I/O objects across requests).
 */
export type ServiceScope = 'app' | 'request'

/** Context passed to service factories. */
export interface ServiceResolutionContext {
  /**
   * Registry of the scope the service is created in. App-scoped factories may only resolve
   * app-scoped services; resolving a request-scoped one throws `ModuleError`.
   */
  readonly services: ServiceRegistry
  /** Scope the service is being created in. */
  readonly scope: ServiceScope
  /**
   * Platform bindings of the current invocation (on Cloudflare: the Worker `env`). Empty for
   * app-scoped services. **Platform packages only** — domain modules never read bindings
   * (architecture §19); they receive infrastructure through services.
   */
  readonly bindings: Readonly<Record<string, unknown>>
}

/** Options for factory-based providers. */
export interface ServiceFactoryOptions<T> {
  readonly scope: ServiceScope
  /**
   * Called when the owning scope ends (request scopes, in reverse creation order) —
   * close connections here. Not called for app-scoped services.
   */
  readonly dispose?: (value: T) => void | Promise<void>
}

/** Write access to the registry, available to modules during `setup`. */
export interface ServiceProvider {
  /** Registers an app-scoped service instance. */
  provide<T>(token: ServiceToken<T>, value: T): void
  /**
   * Registers a lazily created service. The factory runs on first `get` in the given scope.
   *
   * Factories are **synchronous** so `get` stays synchronous. Services needing asynchronous
   * setup initialise lazily on first use (e.g. a client that connects on its first query) or
   * prepare app-scoped state in the module's `boot` hook.
   */
  provideFactory<T>(
    token: ServiceToken<T>,
    factory: (context: ServiceResolutionContext) => T,
    options: ServiceFactoryOptions<T>,
  ): void
}

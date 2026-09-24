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
  has(token: ServiceToken<unknown>): boolean
}

/**
 * Lifetime of a service instance.
 * - `app`: created once per isolate; must not hold per-request I/O objects.
 * - `request`: created at most once per request/event scope and disposed afterwards
 *   (e.g. database clients — Workers cannot share I/O objects across requests).
 *
 * @experimental Finalised by the kernel's service registry (roadmap 003.003).
 */
export type ServiceScope = 'app' | 'request'

/**
 * Context passed to service factories.
 * @experimental Finalised by roadmap 003.003.
 */
export interface ServiceResolutionContext {
  readonly services: ServiceRegistry
  readonly scope: ServiceScope
}

/**
 * Options for factory-based providers.
 * @experimental Finalised by roadmap 003.003.
 */
export interface ServiceFactoryOptions<T> {
  readonly scope: ServiceScope
  /** Called when the owning scope ends (request scope) — close connections here. */
  readonly dispose?: (value: T) => void | Promise<void>
}

/** Write access to the registry, available to modules during `setup`. */
export interface ServiceProvider {
  /** Registers an app-scoped service instance. */
  provide<T>(token: ServiceToken<T>, value: T): void
  /**
   * Registers a lazily created service.
   * @experimental Finalised by roadmap 003.003.
   */
  provideFactory<T>(
    token: ServiceToken<T>,
    factory: (context: ServiceResolutionContext) => T | Promise<T>,
    options: ServiceFactoryOptions<T>,
  ): void
}

import {
  type AnyServiceToken,
  ModuleError,
  type ServiceFactoryOptions,
  type ServiceProvider,
  type ServiceRegistry,
  type ServiceResolutionContext,
  type ServiceScope,
  type ServiceToken,
} from '@blixis/contracts'

/** Name used for kernel-originated errors when no module can be attributed. */
const KERNEL = '@blixis/kernel'

type Entry =
  | {
      readonly kind: 'value'
      readonly module: string
      readonly name: string
      readonly value: unknown
    }
  | {
      readonly kind: 'factory'
      readonly module: string
      readonly name: string
      readonly scope: ServiceScope
      readonly factory: (context: ServiceResolutionContext) => unknown
      readonly dispose?: (value: unknown) => void | Promise<void>
    }

/** A request/event scope: a registry plus disposal of the request-scoped services it created. */
export interface RequestServiceScope {
  readonly services: ServiceRegistry
  /**
   * Disposes request-scoped services in reverse creation order. Every disposer runs; if any
   * fail, rejects with an `AggregateError` after all have been attempted.
   */
  dispose(): Promise<void>
}

/**
 * The kernel's typed service registry (architecture §7, ADR 0005). Modules register during
 * setup through {@link ServiceContainer.forModule}; afterwards the container is sealed.
 */
export class ServiceContainer implements ServiceRegistry {
  readonly #entries = new Map<symbol, Entry>()
  readonly #appInstances = new Map<symbol, unknown>()
  readonly #resolvingApp = new Set<symbol>()
  readonly #overridden = new Set<symbol>()
  #sealed = false

  /** Registration view attributed to `module` (used as its `ctx.services` during setup). */
  forModule(module: string): ServiceRegistry & ServiceProvider {
    return {
      provide: (token, value) =>
        this.#register(token, { kind: 'value', module, name: token.name, value }),
      provideFactory: <T>(
        token: ServiceToken<T>,
        factory: (context: ServiceResolutionContext) => T,
        options: ServiceFactoryOptions<T>,
      ) =>
        this.#register(token, {
          kind: 'factory',
          module,
          name: token.name,
          scope: options.scope,
          factory,
          ...(options.dispose === undefined
            ? {}
            : { dispose: options.dispose as (value: unknown) => void | Promise<void> }),
        }),
      get: (token) => this.#getApp(token, module),
      getOptional: (token) => (this.has(token) ? this.#getApp(token, module) : undefined),
      has: (token) => this.has(token),
    }
  }

  /**
   * Registers an app-scoped replacement for `token` before setup (tests). Module registrations
   * of an overridden token are ignored instead of failing as duplicates.
   */
  override(token: AnyServiceToken, value: unknown): void {
    this.#entries.set(token.id, { kind: 'value', module: 'override', name: token.name, value })
    this.#overridden.add(token.id)
  }

  /** Prevents further registrations (called after all setup hooks ran). */
  seal(): void {
    this.#sealed = true
  }

  get<T>(token: ServiceToken<T>): T {
    return this.#getApp(token, undefined)
  }

  getOptional<T>(token: ServiceToken<T>): T | undefined {
    return this.has(token) ? this.#getApp(token, undefined) : undefined
  }

  has(token: AnyServiceToken): boolean {
    return this.#entries.has(token.id)
  }

  /** Creates a scope for one request, event delivery, cron run, or workflow step. */
  createRequestScope(bindings: Readonly<Record<string, unknown>> = {}): RequestServiceScope {
    const instances = new Map<symbol, unknown>()
    const created: { entry: Entry & { kind: 'factory' }; value: unknown }[] = []
    const resolving = new Set<symbol>()
    let disposed = false

    const registry: ServiceRegistry = {
      get: <T>(token: ServiceToken<T>): T => {
        if (disposed)
          throw new ModuleError(
            KERNEL,
            `request scope already disposed; cannot resolve ${token.name}`,
          )
        const entry = this.#entry(token, undefined)
        if (entry.kind === 'value' || entry.scope === 'app') return this.#getApp(token, undefined)
        if (instances.has(token.id)) return instances.get(token.id) as T
        if (resolving.has(token.id)) {
          throw new ModuleError(entry.module, `circular service resolution involving ${token.name}`)
        }
        resolving.add(token.id)
        try {
          const value = entry.factory({ services: registry, scope: 'request', bindings })
          instances.set(token.id, value)
          created.push({ entry, value })
          return value as T
        } finally {
          resolving.delete(token.id)
        }
      },
      getOptional: <T>(token: ServiceToken<T>): T | undefined =>
        this.has(token) ? registry.get(token) : undefined,
      has: (token) => this.has(token),
    }

    return {
      services: registry,
      dispose: async () => {
        if (disposed) return
        disposed = true
        const errors: unknown[] = []
        for (const { entry, value } of created.reverse()) {
          if (entry.dispose === undefined) continue
          try {
            await entry.dispose(value)
          } catch (error) {
            errors.push(error)
          }
        }
        if (errors.length > 0)
          throw new AggregateError(
            errors,
            `failed to dispose ${errors.length} request-scoped service(s)`,
          )
      },
    }
  }

  #register(token: AnyServiceToken, entry: Entry): void {
    if (this.#sealed) {
      throw new ModuleError(
        entry.module,
        `cannot provide ${token.name} after setup; register services in setup()`,
      )
    }
    if (this.#overridden.has(token.id)) return
    const existing = this.#entries.get(token.id)
    if (existing !== undefined) {
      throw new ModuleError(
        entry.module,
        `service ${token.name} is already provided by ${existing.module} (duplicate service provider)`,
      )
    }
    this.#entries.set(token.id, entry)
  }

  #entry(token: AnyServiceToken, requester: string | undefined): Entry {
    const entry = this.#entries.get(token.id)
    if (entry === undefined) {
      throw new ModuleError(requester ?? KERNEL, `service ${token.name} is not registered`)
    }
    return entry
  }

  #getApp<T>(token: ServiceToken<T>, requester: string | undefined): T {
    const entry = this.#entry(token, requester)
    if (entry.kind === 'value') return entry.value as T
    if (entry.scope === 'request') {
      throw new ModuleError(
        requester ?? KERNEL,
        `service ${token.name} is request-scoped and cannot be resolved outside a request scope`,
      )
    }
    if (this.#appInstances.has(token.id)) return this.#appInstances.get(token.id) as T
    if (this.#resolvingApp.has(token.id)) {
      throw new ModuleError(entry.module, `circular service resolution involving ${token.name}`)
    }
    this.#resolvingApp.add(token.id)
    try {
      const appRegistry: ServiceRegistry = {
        get: (t) => this.#getApp(t, entry.module),
        getOptional: (t) => (this.has(t) ? this.#getApp(t, entry.module) : undefined),
        has: (t) => this.has(t),
      }
      const value = entry.factory({ services: appRegistry, scope: 'app', bindings: {} })
      this.#appInstances.set(token.id, value)
      return value as T
    } finally {
      this.#resolvingApp.delete(token.id)
    }
  }
}

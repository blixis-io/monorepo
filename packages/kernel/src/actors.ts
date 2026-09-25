import {
  type Actor,
  ANONYMOUS_ACTOR,
  createServiceToken,
  ModuleError,
  type ServiceRegistry,
  UnauthorizedError,
} from '@blixis/contracts'

/**
 * Resolves the actor of a request from credentials it recognises (architecture §30):
 * - returns an `Actor` when the request carries its kind of credential and it is valid;
 * - returns `undefined` when the request carries none of its kind ("not mine");
 * - throws `UnauthorizedError` when its kind of credential is present but invalid.
 *
 * Resolvers run **before** the request context exists (the context contains the actor): they may
 * use app services and request-scoped services that don't need `REQUEST_CONTEXT`.
 */
export interface ActorResolverEntry {
  /** For diagnostics, e.g. `jwt`, `api-token`. */
  readonly name: string
  resolve(request: Request, services: ServiceRegistry): Promise<Actor | undefined>
}

/** Registry of actor resolvers; authentication modules register during `setup`. */
export interface ActorResolvers {
  register(resolver: ActorResolverEntry): void
  /** Runs the chain (see {@link ActorResolverRegistry.resolve}); used by test harnesses. */
  resolve(request: Request, services: ServiceRegistry): Promise<Actor>
}

/** Service token of the kernel's {@link ActorResolvers} registry (app scope). */
export const ACTOR_RESOLVERS = createServiceToken<ActorResolvers>('@blixis/kernel.actor-resolvers')

/** Kernel-internal implementation of {@link ActorResolvers}. */
export class ActorResolverRegistry implements ActorResolvers {
  readonly resolvers: ActorResolverEntry[] = []
  #locked = false

  register(resolver: ActorResolverEntry): void {
    if (this.#locked) {
      throw new ModuleError(
        '@blixis/kernel',
        `cannot register actor resolver ${resolver.name} after setup`,
      )
    }
    this.resolvers.push(resolver)
  }

  lock(): void {
    this.#locked = true
  }

  /**
   * Runs resolvers in registration (module bootstrap) order; the first actor wins. A request
   * with an `Authorization` header that no resolver claims is rejected (`401`) rather than
   * treated as anonymous — presented credentials must never be silently ignored.
   */
  async resolve(request: Request, services: ServiceRegistry): Promise<Actor> {
    for (const resolver of this.resolvers) {
      const actor = await resolver.resolve(request, services)
      if (actor !== undefined) return actor
    }
    if (request.headers.has('authorization')) {
      throw new UnauthorizedError('Unsupported or invalid credentials')
    }
    return ANONYMOUS_ACTOR
  }
}

import type { RequestContext, ServiceRegistry } from '@blixis/contracts'

/**
 * The context every resolver receives (§10). Resolvers stay thin: they read the actor and tenant
 * from `requestContext` and call services — never repositories or other modules' internals.
 */
export interface GraphQLContext {
  /** Actor, tenant, request id, logger — the same context REST handlers get. */
  readonly requestContext: RequestContext
  /** Services of this request's scope. */
  readonly services: ServiceRegistry
  /**
   * Per-request memo for batching loaders (DataLoader-style), keyed by the owning module, e.g.
   * `loaders.get('@blixis/content.entries')`. Dropped with the request.
   */
  readonly loaders: Map<string, unknown>
  /**
   * Headers to add to the HTTP response, e.g. `Cache-Control: private, no-store` when a resolver
   * served draft content. Later values replace earlier ones.
   */
  readonly responseHeaders: Headers
}

/**
 * Returns the per-request loader stored under `key`, creating it once per request.
 *
 * @example
 * const entries = loader(context, '@blixis/content.entries', () => createEntryLoader(context))
 */
export function loader<T>(context: GraphQLContext, key: string, create: () => T): T {
  let value = context.loaders.get(key) as T | undefined
  if (value === undefined) {
    value = create()
    context.loaders.set(key, value)
  }
  return value
}

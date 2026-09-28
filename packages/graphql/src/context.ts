import type { GraphQLResolverContext } from '@blixis-io/contracts'

/**
 * The context every resolver receives (§10): the public `GraphQLResolverContext` of
 * `@blixis/contracts`, plus the HTTP request.
 */
export interface GraphQLContext extends GraphQLResolverContext {
  /** The HTTP request (set by GraphQL Yoga), e.g. to build absolute URLs from its origin. */
  readonly request?: Request
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

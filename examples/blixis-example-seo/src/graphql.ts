import type { GraphQLContribution, GraphQLResolverContext } from '@blixis-io/contracts'
import { SEO_SERVICE, type SeoMetadata } from './service.ts'

/**
 * Adds `seo` to the delivered entries' `sys`: `{ page { sys { seo { title description } } } }`.
 * Every entry type has `sys`, so one extension reaches all content types. Lookups are batched per
 * request through `context.loaders`.
 */
export const seoGraphQL: GraphQLContribution<GraphQLResolverContext> = {
  typeDefs: /* GraphQL */ `
    "SEO metadata of an entry (from @blixis-example/seo)."
    type Seo {
      title: String!
      description: String
    }
    extend type Sys {
      seo: Seo!
    }
  `,
  resolvers: {
    Sys: {
      seo: (parent: unknown, _args: unknown, context: GraphQLResolverContext) =>
        loader(context).load((parent as { id: string }).id),
    },
  },
}

/** Collects the entry ids asked for in one tick and loads them with one query. */
function loader(context: GraphQLResolverContext) {
  const key = '@blixis-example/seo.loader'
  let existing = context.loaders.get(key) as ReturnType<typeof createLoader> | undefined
  if (existing === undefined) {
    existing = createLoader(context)
    context.loaders.set(key, existing)
  }
  return existing
}

function createLoader(context: GraphQLResolverContext) {
  let pending: {
    id: string
    resolve: (value: SeoMetadata) => void
    reject: (e: unknown) => void
  }[] = []
  return {
    load(id: string): Promise<SeoMetadata> {
      return new Promise((resolve, reject) => {
        if (pending.length === 0)
          queueMicrotask(() => {
            const batch = pending
            pending = []
            context.services
              .get(SEO_SERVICE)
              .forDeliveredEntries(batch.map((item) => item.id))
              .then((found) => {
                for (const item of batch) item.resolve(found.get(item.id) as SeoMetadata)
              })
              .catch((error: unknown) => {
                for (const item of batch) item.reject(error)
              })
          })
        pending.push({ id, resolve, reject })
      })
    },
  }
}

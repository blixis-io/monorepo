/** A response as the GraphQL response cache stores it (structurally `CachedResponse` of `@blixis/graphql`). */
export interface CacheApiValue {
  readonly body: string
  readonly contentType: string
  readonly etag: string
}

/** The GraphQL response cache port (structurally `ResponseCacheStore` of `@blixis/graphql`). */
export interface CacheApiStore {
  readonly name: string
  match(key: string): Promise<CacheApiValue | undefined>
  put(key: string, value: CacheApiValue, ttlSeconds: number): Promise<void>
}

const ORIGIN = 'https://cache.blixis.internal'

/**
 * L2 response cache on the Workers Cache API (ADR 0012 §2): per Cloudflare data center, keyed by
 * synthetic GET requests so POST queries can be cached too. Cloudflare documents the Cache API
 * for custom domains; on staging's `*.workers.dev` it served hits as well (measured 2026-09-26).
 * Where it stores nothing, every lookup is simply a miss.
 */
export function createCacheApiStore(
  options: { cache?: Cache; namespace?: string } = {},
): CacheApiStore {
  const namespace = options.namespace ?? 'graphql'
  const cache = () => options.cache ?? (caches as unknown as { default: Cache }).default
  const request = (key: string) => new Request(`${ORIGIN}/${namespace}/${key}`)
  return {
    name: 'cache-api',
    async match(key) {
      const response = await cache().match(request(key))
      if (response === undefined) return undefined
      return {
        body: await response.text(),
        contentType: response.headers.get('content-type') ?? 'application/json',
        etag: response.headers.get('x-blixis-etag') ?? '',
      }
    },
    async put(key, value, ttlSeconds) {
      await cache().put(
        request(key),
        new Response(value.body, {
          headers: {
            'content-type': value.contentType,
            'cache-control': `public, max-age=${ttlSeconds}`,
            'x-blixis-etag': value.etag,
          },
        }),
      )
    },
  }
}

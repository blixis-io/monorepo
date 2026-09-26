/** A cached GraphQL response: body plus the headers worth replaying. */
export interface CachedResponse {
  readonly body: string
  readonly contentType: string
  /** Strong ETag of the body (quoted), for `If-None-Match`. */
  readonly etag: string
}

/**
 * A place to keep delivery responses (ADR 0012). Keys are opaque hashes that already contain the
 * content stamp, so stores never need invalidation — only a time to live.
 */
export interface ResponseCacheStore {
  readonly name: string
  match(key: string): Promise<CachedResponse | undefined>
  put(key: string, value: CachedResponse, ttlSeconds: number): Promise<void>
}

/**
 * L1: an LRU in isolate memory, bounded by entries and bytes (ADR 0012 §2). Lost when the isolate
 * is recycled — that only costs a miss.
 */
export function createMemoryResponseCache(
  options: { maxEntries?: number; maxBytes?: number; now?: () => number } = {},
): ResponseCacheStore & { readonly size: number; readonly bytes: number } {
  const maxEntries = options.maxEntries ?? 500
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024
  const now = options.now ?? Date.now
  const entries = new Map<string, { value: CachedResponse; expires: number; bytes: number }>()
  let bytes = 0
  const remove = (key: string) => {
    const entry = entries.get(key)
    if (entry === undefined) return
    bytes -= entry.bytes
    entries.delete(key)
  }
  return {
    name: 'memory',
    async match(key) {
      const entry = entries.get(key)
      if (entry === undefined) return undefined
      if (entry.expires <= now()) {
        remove(key)
        return undefined
      }
      entries.delete(key)
      entries.set(key, entry)
      return entry.value
    },
    async put(key, value, ttlSeconds) {
      const size = value.body.length * 2 + value.etag.length * 2 + 64
      if (size > maxBytes) return
      remove(key)
      entries.set(key, { value, expires: now() + ttlSeconds * 1000, bytes: size })
      bytes += size
      while (entries.size > maxEntries || bytes > maxBytes) {
        const oldest = entries.keys().next().value
        if (oldest === undefined) break
        remove(oldest)
      }
    },
    get size() {
      return entries.size
    },
    get bytes() {
      return bytes
    },
  }
}

/**
 * Looks stores up in order and fills the faster ones on a hit in a slower one (L2 → L1). Store
 * failures count as misses: a cache must never fail a request.
 */
export function createTieredCache(
  stores: readonly { store: ResponseCacheStore; ttlSeconds: number }[],
): ResponseCacheStore & { lastHit?: string } {
  const tiered: ResponseCacheStore & { lastHit?: string } = {
    name: stores.map((s) => s.store.name).join('+'),
    async match(key) {
      for (const [index, { store }] of stores.entries()) {
        const value = await store.match(key).catch(() => undefined)
        if (value === undefined) continue
        tiered.lastHit = store.name
        await Promise.all(
          stores
            .slice(0, index)
            .map((faster) =>
              faster.store.put(key, value, faster.ttlSeconds).catch(() => undefined),
            ),
        )
        return value
      }
      return undefined
    },
    async put(key, value) {
      await Promise.all(
        stores.map(({ store, ttlSeconds }) =>
          store.put(key, value, ttlSeconds).catch(() => undefined),
        ),
      )
    },
  }
  return tiered
}

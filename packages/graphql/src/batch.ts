/**
 * A minimal DataLoader: `load(key)` calls made in the same tick are collected and fetched with
 * one `batch(keys)` call; results are cached per key for the loader's lifetime (one request).
 * Keep one loader per request via `loader(context, key, create)`.
 */
export interface BatchLoader<K, V> {
  load(key: K): Promise<V | undefined>
  loadMany(keys: readonly K[]): Promise<(V | undefined)[]>
}

export function createBatchLoader<K, V>(
  batch: (keys: readonly K[]) => Promise<ReadonlyMap<K, V>>,
): BatchLoader<K, V> {
  const cache = new Map<K, Promise<V | undefined>>()
  let pending: { key: K; resolve: (v: V | undefined) => void; reject: (e: unknown) => void }[] = []

  function flush() {
    const current = pending
    pending = []
    batch(current.map((p) => p.key)).then(
      (results) => {
        for (const p of current) p.resolve(results.get(p.key))
      },
      (error: unknown) => {
        for (const p of current) {
          cache.delete(p.key)
          p.reject(error)
        }
      },
    )
  }

  const loader: BatchLoader<K, V> = {
    load(key) {
      let result = cache.get(key)
      if (result === undefined) {
        result = new Promise<V | undefined>((resolve, reject) => {
          if (pending.length === 0) queueMicrotask(flush)
          pending.push({ key, resolve, reject })
        })
        cache.set(key, result)
      }
      return result
    },
    loadMany: (keys) => Promise.all(keys.map((k) => loader.load(k))),
  }
  return loader
}

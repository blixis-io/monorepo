import { describe, expect, it } from 'vitest'
import {
  type CachedResponse,
  createMemoryResponseCache,
  createTieredCache,
  type ResponseCacheStore,
} from './cache.ts'

const value = (body: string): CachedResponse => ({
  body,
  contentType: 'application/json',
  etag: `"${body}"`,
})

describe('memory response cache', () => {
  it('expires entries and evicts the least recently used by count and bytes', async () => {
    let now = 0
    const cache = createMemoryResponseCache({ maxEntries: 2, maxBytes: 10_000, now: () => now })
    await cache.put('a', value('A'), 10)
    await cache.put('b', value('B'), 10)
    await cache.match('a') // a is now most recent
    await cache.put('c', value('C'), 10)
    expect(await cache.match('b')).toBeUndefined()
    expect((await cache.match('a'))?.body).toBe('A')
    now = 11_000
    expect(await cache.match('a')).toBeUndefined()
    const small = createMemoryResponseCache({ maxBytes: 1500 })
    await small.put('x', value('x'.repeat(200)), 10)
    await small.put('y', value('y'.repeat(200)), 10)
    expect(small.size).toBe(1)
    await small.put('huge', value('z'.repeat(1000)), 10)
    expect(await small.match('huge')).toBeUndefined()
  })
})

describe('tiered cache', () => {
  it('fills faster tiers from slower ones and treats failures as misses', async () => {
    const l1 = createMemoryResponseCache()
    const l2 = createMemoryResponseCache()
    const broken: ResponseCacheStore = {
      name: 'broken',
      match: () => Promise.reject(new Error('down')),
      put: () => Promise.reject(new Error('down')),
    }
    const tiered = createTieredCache([
      { store: l1, ttlSeconds: 60 },
      { store: broken, ttlSeconds: 60 },
      { store: l2, ttlSeconds: 3600 },
    ])
    await l2.put('k', value('from l2'), 60)
    expect((await tiered.match('k'))?.body).toBe('from l2')
    expect(tiered.lastHit).toBe('memory')
    expect((await l1.match('k'))?.body).toBe('from l2')
    await tiered.put('n', value('new'), 0)
    expect((await l1.match('n'))?.body).toBe('new')
    expect((await l2.match('n'))?.body).toBe('new')
    expect(await tiered.match('missing')).toBeUndefined()
  })
})

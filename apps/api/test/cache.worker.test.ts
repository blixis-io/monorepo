import { createCacheApiStore } from '@blixis/cloudflare'
import { describe, expect, it } from 'vitest'

describe('Cache API response store (workerd)', () => {
  it('stores and returns responses under synthetic keys, per namespace', async () => {
    const store = createCacheApiStore({ namespace: `test-${crypto.randomUUID()}` })
    expect(await store.match('k1')).toBeUndefined()
    await store.put(
      'k1',
      { body: '{"data":{}}', contentType: 'application/json', etag: '"abc"' },
      60,
    )
    expect(await store.match('k1')).toEqual({
      body: '{"data":{}}',
      contentType: 'application/json',
      etag: '"abc"',
    })
    const other = createCacheApiStore({ namespace: `other-${crypto.randomUUID()}` })
    expect(await other.match('k1')).toBeUndefined()
  })
})

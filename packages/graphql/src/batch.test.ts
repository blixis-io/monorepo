import { describe, expect, it } from 'vitest'
import { createBatchLoader } from './batch.ts'

describe('createBatchLoader', () => {
  it('batches loads of one tick into one call and caches per key', async () => {
    const calls: string[][] = []
    const loader = createBatchLoader(async (keys: readonly string[]) => {
      calls.push([...keys])
      return new Map(keys.filter((k) => k !== 'missing').map((k) => [k, k.toUpperCase()]))
    })
    const [a, b, missing] = await Promise.all([
      loader.load('a'),
      loader.load('b'),
      loader.load('missing'),
    ])
    expect([a, b, missing]).toEqual(['A', 'B', undefined])
    expect(await loader.loadMany(['a', 'c'])).toEqual(['A', 'C'])
    expect(calls).toEqual([['a', 'b', 'missing'], ['c']])
  })

  it('rejects every waiting load when the batch fails, and retries later', async () => {
    let fail = true
    const loader = createBatchLoader(async (keys: readonly string[]) => {
      if (fail) throw new Error('down')
      return new Map(keys.map((k) => [k, 1]))
    })
    await expect(Promise.all([loader.load('a'), loader.load('b')])).rejects.toThrowError('down')
    fail = false
    expect(await loader.load('a')).toBe(1)
  })
})

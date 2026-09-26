import { describe, expect, it } from 'vitest'
import { createMemoryObjectStorage } from './object-storage.ts'

const sha256 = async (text: string) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')

describe('memory object storage', () => {
  it('stores streams and reads ranges, heads, lists and deletes idempotently', async () => {
    const storage = createMemoryObjectStorage()
    const stream = new Response('hello world').body as ReadableStream<Uint8Array>
    const put = await storage.put('s1/a1/f1', stream, { size: 11, contentType: 'text/plain' })
    expect(put).toMatchObject({ key: 's1/a1/f1', size: 11, contentType: 'text/plain' })
    expect(put.etag).toMatch(/^".+"$/)
    const ranged = await storage.get('s1/a1/f1', { range: { offset: 6 } })
    expect(await new Response(ranged?.body).text()).toBe('world')
    expect(ranged?.range).toEqual({ offset: 6, length: 5 })
    const suffix = await storage.get('s1/a1/f1', { range: { suffix: 3 } })
    expect(await new Response(suffix?.body).text()).toBe('rld')
    await storage.put('s1/a2/f1', 'x')
    await storage.put('s2/a3/f1', 'y')
    const page = await storage.list('s1/', { limit: 1 })
    expect(page).toEqual({ keys: ['s1/a1/f1'], cursor: '1' })
    expect(await storage.list('s1/', { cursor: page.cursor ?? '' })).toEqual({ keys: ['s1/a2/f1'] })
    await storage.delete(['s1/a1/f1', 'missing'])
    await storage.delete('s1/a1/f1')
    expect(await storage.head('s1/a1/f1')).toBeUndefined()
    expect(storage.keys()).toEqual(['s1/a2/f1', 's2/a3/f1'])
  })

  it('verifies sizes and checksums and stores nothing on a mismatch', async () => {
    const storage = createMemoryObjectStorage()
    await expect(storage.put('k', 'abc', { sha256: await sha256('abd') })).rejects.toThrow(
      'Checksum mismatch',
    )
    await expect(storage.put('k', 'abc', { size: 4 })).rejects.toThrow('Expected 4 bytes')
    expect(storage.keys()).toEqual([])
    await storage.put('k', 'abc', { sha256: await sha256('abc') })
    expect(storage.text('k')).toBe('abc')
  })

  it('enforces R2 multipart rules', async () => {
    const storage = createMemoryObjectStorage({ minPartBytes: 4 })
    const { uploadId } = await storage.createMultipart('big', { contentType: 'video/mp4' })
    const p1 = await storage.uploadPart('big', uploadId, 1, 'aaaa', 4)
    const p3 = await storage.uploadPart('big', uploadId, 3, 'c', 1)
    const p2 = await storage.uploadPart('big', uploadId, 2, 'bbbb', 4)
    await expect(storage.uploadPart('big', uploadId, 0, 'x', 1)).rejects.toThrow('Part number')
    await expect(storage.uploadPart('other', uploadId, 1, 'x', 1)).rejects.toThrow('not found')
    const done = await storage.completeMultipart('big', uploadId, [p3, p1, p2])
    expect(done).toMatchObject({ size: 9, contentType: 'video/mp4' })
    expect(storage.text('big')).toBe('aaaabbbbc')
    expect(storage.pendingUploads).toBe(0)

    const uneven = await storage.createMultipart('u')
    const u1 = await storage.uploadPart('u', uneven.uploadId, 1, 'aaaa', 4)
    const u2 = await storage.uploadPart('u', uneven.uploadId, 2, 'bbbbb', 5)
    const u3 = await storage.uploadPart('u', uneven.uploadId, 3, 'c', 1)
    await expect(storage.completeMultipart('u', uneven.uploadId, [u1, u2, u3])).rejects.toThrow(
      'same size',
    )
    const small = await storage.createMultipart('s')
    const s1 = await storage.uploadPart('s', small.uploadId, 1, 'aa', 2)
    const s2 = await storage.uploadPart('s', small.uploadId, 2, 'b', 1)
    await expect(storage.completeMultipart('s', small.uploadId, [s1, s2])).rejects.toThrow(
      'smaller than',
    )
    await storage.abortMultipart('s', small.uploadId)
    await storage.abortMultipart('s', small.uploadId)
  })
})

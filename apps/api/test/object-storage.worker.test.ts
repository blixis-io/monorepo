import { env } from 'cloudflare:test'
import { r2ObjectStorage } from '@blixis-io/cloudflare'
import { describe, expect, it } from 'vitest'

const MiB = 1024 * 1024

/** A stream of `size` bytes produced 64 KiB at a time, never held in memory as a whole. */
function generated(size: number, fill = 7): ReadableStream<Uint8Array> {
  let sent = 0
  return new ReadableStream({
    pull(controller) {
      if (sent >= size) return controller.close()
      const chunk = new Uint8Array(Math.min(64 * 1024, size - sent)).fill(fill)
      sent += chunk.length
      controller.enqueue(chunk)
    },
  })
}

async function sha256Hex(text: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

describe('R2 object storage (workerd)', () => {
  const storage = () => r2ObjectStorage(env.ASSETS)
  const prefix = () => `test-${crypto.randomUUID()}`

  it('streams a multi-MB file without buffering and reads it back in ranges', async () => {
    const key = `${prefix()}/asset/file`
    const put = await storage().put(key, generated(12 * MiB), {
      size: 12 * MiB,
      contentType: 'video/mp4',
    })
    expect(put).toMatchObject({ key, size: 12 * MiB, contentType: 'video/mp4' })
    expect(put.etag).toMatch(/^".+"$/)
    const head = await storage().head(key)
    expect(head?.size).toBe(12 * MiB)
    const tail = await storage().get(key, { range: { suffix: 10 } })
    expect(tail?.range).toEqual({ offset: 12 * MiB - 10, length: 10 })
    expect(new Uint8Array(await new Response(tail?.body).arrayBuffer())).toEqual(
      new Uint8Array(10).fill(7),
    )
    const middle = await storage().get(key, { range: { offset: MiB, length: 4 } })
    expect((await new Response(middle?.body).arrayBuffer()).byteLength).toBe(4)
  })

  it('rejects a checksum mismatch and stores nothing', async () => {
    const key = `${prefix()}/a/f`
    await expect(storage().put(key, 'abc', { sha256: await sha256Hex('abd') })).rejects.toThrow(
      'Checksum mismatch',
    )
    // A stream shorter than `size` is rejected too (ValidationError), but miniflare's local R2
    // then logs an uncaught "Network connection lost"; the memory fake covers that case.
    expect(await storage().head(key)).toBeUndefined()
    await storage().put(key, 'abc', { sha256: await sha256Hex('abc') })
    expect(await (await storage().get(key))?.body.getReader().read()).toBeDefined()
  })

  it('lists by prefix in pages and deletes idempotently', async () => {
    const p = prefix()
    for (const name of ['a', 'b', 'c']) await storage().put(`${p}/${name}`, name)
    const first = await storage().list(`${p}/`, { limit: 2 })
    expect(first.keys).toEqual([`${p}/a`, `${p}/b`])
    expect(first.cursor).toBeDefined()
    const second = await storage().list(`${p}/`, { cursor: first.cursor ?? '' })
    expect(second).toEqual({ keys: [`${p}/c`] })
    await storage().delete([`${p}/a`, `${p}/b`, `${p}/missing`])
    await storage().delete(`${p}/a`)
    expect((await storage().list(`${p}/`)).keys).toEqual([`${p}/c`])
    expect(await storage().get(`${p}/a`)).toBeUndefined()
  })

  it('assembles multipart uploads from streamed parts and aborts idempotently', async () => {
    const key = `${prefix()}/big/file`
    const { uploadId } = await storage().createMultipart(key, { contentType: 'video/webm' })
    const parts = [
      await storage().uploadPart(key, uploadId, 1, generated(5 * MiB, 1), 5 * MiB),
      await storage().uploadPart(key, uploadId, 2, generated(5 * MiB, 2), 5 * MiB),
      await storage().uploadPart(key, uploadId, 3, generated(3, 3), 3),
    ]
    const done = await storage().completeMultipart(key, uploadId, parts)
    expect(done).toMatchObject({ key, size: 10 * MiB + 3, contentType: 'video/webm' })
    const last = await storage().get(key, { range: { suffix: 4 } })
    expect([...new Uint8Array(await new Response(last?.body).arrayBuffer())]).toEqual([2, 3, 3, 3])

    const other = `${prefix()}/aborted`
    const aborted = await storage().createMultipart(other)
    await storage().abortMultipart(other, aborted.uploadId)
    await storage().abortMultipart(other, aborted.uploadId)
    expect(await storage().head(other)).toBeUndefined()
  })
})

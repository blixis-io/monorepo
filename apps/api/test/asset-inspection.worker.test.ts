import { inspectUpload } from '@blixis/assets'
import { describe, expect, it } from 'vitest'

const png = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 1, 0,
  0, 0, 0, 200, 8, 6, 0, 0, 0,
])

const streamOf = (bytes: Uint8Array, chunk = 7) =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunk) controller.enqueue(bytes.slice(i, i + chunk))
      controller.close()
    },
  })

describe('upload inspection (workerd)', () => {
  it('hashes with DigestStream and reads dimensions while passing bytes through', async () => {
    const { stream, inspection } = inspectUpload(streamOf(png), 'image/png')
    const passed = new Uint8Array(await new Response(stream).arrayBuffer())
    expect(passed).toEqual(png)
    const expected = [...new Uint8Array(await crypto.subtle.digest('SHA-256', png))]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    expect(await inspection.result()).toEqual({ sha256: expected, width: 256, height: 200 })
  })

  it('aborts a stream whose bytes contradict the declared type', async () => {
    const html = new TextEncoder().encode('<!doctype html><script>alert(1)</script>')
    const { stream, inspection } = inspectUpload(streamOf(html), 'image/png')
    await expect(new Response(stream).arrayBuffer()).rejects.toThrow('does not match')
    expect(inspection.rejection()?.message).toBe('The file does not match its declared type')
  })
})

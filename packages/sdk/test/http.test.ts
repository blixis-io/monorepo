import { describe, expect, it } from 'vitest'
import { BlixisApiError, createBlixisClient } from '../src/index.ts'

const problem = (status: number, code: string) =>
  new Response(
    JSON.stringify({
      type: 'x',
      title: 'x',
      status,
      code,
      detail: `failed ${status}`,
      requestId: 'req-1',
    }),
    {
      status,
      headers: { 'content-type': 'application/problem+json' },
    },
  )

describe('SDK HTTP core', () => {
  it('retries 503 and 429 for safe requests, honouring Retry-After', async () => {
    const answers = [
      problem(503, 'INFRASTRUCTURE_ERROR'),
      new Response(null, { status: 429, headers: { 'retry-after': '0' } }),
      Response.json({ organizations: [] }),
    ]
    const seen: Request[] = []
    const blixis = createBlixisClient({
      baseUrl: 'https://api.example.com/',
      token: 'blx_pat_x',
      fetch: async (request) => {
        seen.push(request)
        return answers.shift() ?? new Response(null, { status: 500 })
      },
    })
    expect(await blixis.organizations.list()).toEqual([])
    expect(seen).toHaveLength(3)
    expect(seen[0]?.url).toBe('https://api.example.com/api/v1/organizations')
    expect(seen[0]?.headers.get('authorization')).toBe('Bearer blx_pat_x')
  })

  it('never repeats unsafe requests, but retries commands with an idempotency key', async () => {
    let calls = 0
    const blixis = createBlixisClient({
      baseUrl: 'https://api.example.com',
      fetch: async () => {
        calls++
        return problem(503, 'INFRASTRUCTURE_ERROR')
      },
    })
    await expect(blixis.organizations.create({ name: 'x', slug: 'x' })).rejects.toMatchObject({
      status: 503,
      requestId: 'req-1',
    })
    expect(calls).toBe(1)
    calls = 0
    const seenKeys: (string | null)[] = []
    const retrying = createBlixisClient({
      baseUrl: 'https://api.example.com',
      fetch: async (request) => {
        calls++
        seenKeys.push(request.headers.get('idempotency-key'))
        return calls < 3
          ? problem(503, 'INFRASTRUCTURE_ERROR')
          : Response.json({ sys: {}, fields: {} })
      },
    })
    await retrying.entries.publish('e1')
    expect(calls).toBe(3)
    expect(new Set(seenKeys).size).toBe(1) // one generated key for every attempt
    expect(seenKeys[0]).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('maps network failures, fills paths safely, and sends If-Match and uploads', async () => {
    const failing = createBlixisClient({
      baseUrl: 'https://api.example.com',
      retries: 0,
      fetch: async () => {
        throw new TypeError('fetch failed')
      },
    })
    const error = await failing.spaces.get('x').catch((e) => e)
    expect(error).toBeInstanceOf(BlixisApiError)
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR' })

    const requests: Request[] = []
    const blixis = createBlixisClient({
      baseUrl: 'https://api.example.com',
      fetch: async (request) => {
        requests.push(request)
        return Response.json({})
      },
    })
    await blixis.entries.update('a/b', { title: 'x' }, 7)
    expect(requests[0]?.url).toBe('https://api.example.com/api/v1/entries/a%2Fb')
    expect(requests[0]?.headers.get('if-match')).toBe('"7"')
    await blixis.assets.upload('s1', new Blob(['x'], { type: 'image/png' }), {
      filename: 'café.png',
      sha256: 'ab'.repeat(32),
    })
    expect(Object.fromEntries(requests[1]?.headers ?? [])).toMatchObject({
      'content-type': 'image/png',
      'content-disposition': "attachment; filename*=UTF-8''caf%C3%A9.png",
      'content-digest': `sha-256=:${btoa(String.fromCharCode(...new Array(32).fill(0xab)))}:`,
    })
    await expect(
      blixis.assets.upload('s1', new Uint8Array([1]), { filename: 'x' }),
    ).rejects.toThrow('contentType')
  })
})

import { BlixisApiError, createBlixisClient, createBlixisGraphQLClient } from '@blixis-io/sdk'
import { describe, expect, it } from 'vitest'

/**
 * The SDK in workerd — a web-standard runtime without Node APIs, like browsers (plan 017): client
 * setup, typed calls, retries with idempotency keys, uploads, persisted queries, and errors.
 */
describe('@blixis/sdk in the Workers runtime', () => {
  it('calls the Management API with retries, idempotency keys, and uploads', async () => {
    const seen: Request[] = []
    let failures = 1
    const blixis = createBlixisClient({
      baseUrl: 'https://api.example.com',
      token: 'blx_pat_test',
      fetch: async (request) => {
        seen.push(request.clone() as Request)
        if (failures-- > 0) return new Response(null, { status: 503 })
        return Response.json({ sys: { id: 'e1', status: 'published' }, fields: {} })
      },
    })
    const entry = await blixis.entries.publish('e1')
    expect(entry.sys.status).toBe('published')
    expect(seen.map((r) => r.headers.get('idempotency-key'))).toEqual([
      seen[0]?.headers.get('idempotency-key'),
      seen[0]?.headers.get('idempotency-key'),
    ])

    seen.length = 0
    await blixis.assets.upload('s1', new Blob(['hello'], { type: 'text/plain' }), {
      filename: 'hé.txt',
    })
    const upload = seen[0]
    expect(upload?.headers.get('content-length')).toBe('5')
    expect(upload?.headers.get('content-disposition')).toBe(
      "attachment; filename*=UTF-8''h%C3%A9.txt",
    )
    expect(await upload?.text()).toBe('hello')
  })

  it('queries GraphQL with persisted queries and maps errors', async () => {
    const methods: string[] = []
    const delivery = createBlixisGraphQLClient({
      baseUrl: 'https://api.example.com',
      token: 'blx_dk_test',
      fetch: async (request) => {
        methods.push(request.method)
        if (request.method === 'GET')
          return Response.json({ errors: [{ message: 'PersistedQueryNotFound' }] }, { status: 404 })
        const body = (await request.json()) as { query: string }
        return body.query.includes('forbidden')
          ? Response.json({ errors: [{ message: 'No', extensions: { code: 'FORBIDDEN' } }] })
          : Response.json({ data: { ok: true } })
      },
    })
    expect(await delivery.query('{ ok }')).toEqual({ ok: true })
    expect(methods).toEqual(['GET', 'POST'])
    const error = await delivery.query('{ forbidden }').catch((e) => e)
    expect(error).toBeInstanceOf(BlixisApiError)
    expect(error).toMatchObject({ code: 'FORBIDDEN' })
  })
})

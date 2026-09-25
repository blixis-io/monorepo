import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index.ts'

async function graphql(query: string, headers: Record<string, string> = {}): Promise<Response> {
  const ctx = createExecutionContext()
  const request = new Request('http://api.test/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({ query }),
  }) as Request<unknown, IncomingRequestCfProperties>
  const response = await worker.fetch(request, env, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

describe('GraphQL endpoint (workerd)', () => {
  it('serves /graphql outside /api/v1 with the platform query', async () => {
    const res = await graphql('{ _platform { version modules { name } } }')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    const body = (await res.json()) as {
      data: { _platform: { version: string; modules: { name: string }[] } }
    }
    expect(body.data._platform.version).toEqual(expect.any(String))
    expect(body.data._platform.modules.map((m) => m.name)).toEqual(
      expect.arrayContaining(['@blixis/content', '@blixis/graphql']),
    )
  })

  it('reports query errors in the GraphQL format', async () => {
    // GraphQL over HTTP: `application/json` clients get 200 with errors; the newer media type 400.
    const res = await graphql('{ nope }', { accept: 'application/graphql-response+json' })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { errors: { message: string }[] }
    expect(body.errors[0]?.message).toContain('Cannot query field "nope"')
  })
})

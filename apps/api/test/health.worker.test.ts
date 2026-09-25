import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index.ts'

async function call(path: string, init?: RequestInit, bindings: Env = env): Promise<Response> {
  const ctx = createExecutionContext()
  const request = new Request(`http://api.test${path}`, init) as Request<
    unknown,
    IncomingRequestCfProperties
  >
  const response = await worker.fetch(request, bindings, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

describe('API Worker (workerd)', () => {
  it('answers the liveness check', async () => {
    const res = await call('/api/v1/health')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('returns problem details for unknown routes with trace headers', async () => {
    const res = await call('/api/v1/does-not-exist', { headers: { 'x-correlation-id': 'corr-42' } })
    expect(res.status).toBe(404)
    expect(res.headers.get('content-type')).toBe('application/problem+json')
    expect(res.headers.get('x-correlation-id')).toBe('corr-42')
    const body = (await res.json()) as { code: string; requestId: string }
    expect(body.code).toBe('NOT_FOUND')
    expect(body.requestId).toBe(res.headers.get('x-request-id'))
  })

  it('fails with a redacted 500 when the environment is invalid', async () => {
    const res = await call('/api/v1/health', undefined, { ...env, BLIXIS_ENV: 'nonsense' as never })
    expect(res.status).toBe(500)
    const body = (await res.json()) as { code: string; detail: string }
    expect(body.code).toBe('INFRASTRUCTURE_ERROR')
    expect(body.detail).not.toContain('BLIXIS_ENV')
  })
})

describe('auth configuration failures stay contained (workerd)', () => {
  it('an empty AUTH_SIGNING_KEYS breaks only auth routes, not health or readiness', async () => {
    const bindings = { ...env, AUTH_SIGNING_KEYS: '' } as Env
    expect((await call('/api/v1/health', undefined, bindings)).status).toBe(200)
    const jwks = await call('/api/v1/auth/jwks', undefined, bindings)
    expect(jwks.status).toBe(500)
    expect(((await jwks.json()) as { code: string }).code).toBe('INFRASTRUCTURE_ERROR')
  })
})

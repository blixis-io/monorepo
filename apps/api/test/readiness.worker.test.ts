import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'
import worker from '../src/index.ts'

async function call(path: string, bindings: Env): Promise<Response> {
  const ctx = createExecutionContext()
  const request = new Request(`http://api.test${path}`) as Request<
    unknown,
    IncomingRequestCfProperties
  >
  const response = await worker.fetch(request, bindings, ctx)
  await waitOnExecutionContext(ctx)
  return response
}

// The success path (200 through HYPERDRIVE) is covered in the Node pool
// (packages/testing/src/readiness.test.ts) and on staging: pg cannot open sockets inside the
// Vitest Workers pool yet (docs/conventions/testing.md#known-issues).
describe('readiness in the API Worker (workerd)', () => {
  it('answers 503 without connection details when the database is unreachable', async () => {
    const unreachable = {
      ...env,
      HYPERDRIVE: { connectionString: 'postgres://app:hunter2@127.0.0.1:1/neondb' },
    } as unknown as Env
    const res = await call('/api/v1/health/ready', unreachable)
    expect(res.status).toBe(503)
    expect(res.headers.get('cache-control')).toBe('no-store')
    const body = await res.text()
    expect(JSON.parse(body)).toMatchObject({
      status: 'unavailable',
      checks: { database: { status: 'fail' } },
    })
    expect(body).not.toMatch(/hunter2|127\.0\.0\.1|neondb/)
  })

  it('keeps liveness I/O-free even when the database is down', async () => {
    const unreachable = {
      ...env,
      HYPERDRIVE: { connectionString: 'postgres://app:x@127.0.0.1:1/db' },
    } as unknown as Env
    expect((await call('/api/v1/health', unreachable)).status).toBe(200)
  })
})

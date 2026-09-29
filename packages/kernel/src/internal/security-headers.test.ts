import { Hono } from 'hono'
import { describe, expect, it } from 'vitest'
import { createBlixis } from '../create-blixis.ts'
import { defineModule } from '../define-module.ts'
import { noopLogger } from '../logger.ts'

const echo = defineModule({
  meta: { name: '@acme/echo', version: '1.0.0' },
  rest: {
    path: '/echo',
    app: new Hono()
      .post('/', async (c) => c.json({ size: JSON.stringify(await c.req.json()).length }))
      .post('/raw', async (c) => c.json({ size: (await c.req.arrayBuffer()).byteLength }))
      .get('/page', (c) => c.html('<p>hi</p>'))
      .get('/own-csp', (c) => c.body('x', 200, { 'content-security-policy': 'sandbox' })) as never,
  },
})

const app = createBlixis({ modules: [echo()], logger: noopLogger, maxJsonBodyBytes: 1000 })
const call = (path: string, init?: RequestInit) =>
  app.fetch(new Request(`http://x${path}`, init), {}, undefined as never)

describe('security headers', () => {
  it('sets the baseline on API, health, and error responses', async () => {
    for (const path of ['/api/v1/health', '/api/v1/nothing', '/api/v1/echo/page']) {
      const res = await call(path)
      expect(res.headers.get('x-content-type-options')).toBe('nosniff')
      expect(res.headers.get('referrer-policy')).toBe('no-referrer')
      expect(res.headers.get('strict-transport-security')).toContain('max-age=')
      expect(res.headers.get('x-frame-options')).toBe('DENY')
    }
    expect((await call('/api/v1/health')).headers.get('content-security-policy')).toBe(
      "default-src 'none'; frame-ancestors 'none'",
    )
  })

  it('keeps a handler CSP and adds none to HTML pages', async () => {
    expect((await call('/api/v1/echo/own-csp')).headers.get('content-security-policy')).toBe(
      'sandbox',
    )
    expect((await call('/api/v1/echo/page')).headers.get('content-security-policy')).toBeNull()
  })
})

describe('JSON body limit', () => {
  const post = (path: string, body: string, type = 'application/json', stream = false) =>
    call(path, {
      method: 'POST',
      headers: { 'content-type': type },
      body: stream ? new Blob([body]).stream() : body,
      ...(stream ? { duplex: 'half' } : {}),
    } as RequestInit)
  const big = JSON.stringify({ text: 'x'.repeat(2000) })

  it('accepts JSON under the limit and refuses larger bodies with 400', async () => {
    expect((await post('/api/v1/echo', JSON.stringify({ a: 1 }))).status).toBe(200)
    const res = await post('/api/v1/echo', big)
    expect(res.status).toBe(400)
    expect(((await res.json()) as { code: string }).code).toBe('VALIDATION_FAILED')
  })

  it('also refuses streamed JSON without Content-Length, and +json types', async () => {
    expect((await post('/api/v1/echo', big, 'application/json', true)).status).toBe(400)
    expect((await post('/api/v1/echo', big, 'application/merge-patch+json')).status).toBe(400)
  })

  it('leaves other content types (raw uploads) alone', async () => {
    const res = await post('/api/v1/echo/raw', 'x'.repeat(5000), 'application/octet-stream')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ size: 5000 })
  })
})

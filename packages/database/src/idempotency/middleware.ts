import { type Actor, type ModuleHonoEnv, ValidationError } from '@blixis/contracts'
import type { Context, Next } from 'hono'
import { IDEMPOTENCY } from './service.ts'

const KEY = /^[\x21-\x7e]{1,255}$/

function actorKey(actor: Actor): string {
  switch (actor.type) {
    case 'user':
      return `user:${actor.userId}`
    case 'apiToken':
      return `apiToken:${actor.tokenId}`
    case 'deliveryKey':
      return `deliveryKey:${actor.keyId}`
    case 'system':
      return `system:${actor.component}`
    case 'anonymous':
      return 'anonymous'
  }
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

interface StoredResponse {
  readonly status: number
  readonly contentType: string | null
  readonly body: string
}

/** Options for {@link idempotent}. */
export interface IdempotentOptions {
  /** Reject requests without `Idempotency-Key` (400). Default `false`: pass them through. */
  readonly required?: boolean
}

/**
 * Hono middleware for command routes (§33): honours the `Idempotency-Key` request header.
 *
 * - The key is scoped by tenant (organization and space), actor, method, and route pattern, so
 *   one tenant or actor can never replay another's result.
 * - The request is fingerprinted (method, path, query, body); reusing a key for a different
 *   request is a `409`.
 * - A repeat returns the stored response with `Idempotent-Replayed: true`; a repeat while the
 *   first is still running is a `409`.
 * - `5xx` responses are not stored (the key is released so the client can retry).
 *
 * Needs `idempotencyModule()`.
 *
 * @example
 * routes.post('/entries', idempotent(), async (c) => ...)
 */
export function idempotent(options: IdempotentOptions = {}) {
  return async (c: Context<ModuleHonoEnv>, next: Next): Promise<Response | undefined> => {
    const key = c.req.header('idempotency-key')
    if (key === undefined) {
      if (options.required === true) {
        throw new ValidationError('Idempotency-Key header is required', [
          { path: ['headers', 'Idempotency-Key'], message: 'Required' },
        ])
      }
      await next()
      return undefined
    }
    if (!KEY.test(key)) {
      throw new ValidationError('Invalid Idempotency-Key', [
        { path: ['headers', 'Idempotency-Key'], message: '1–255 visible ASCII characters' },
      ])
    }
    const { tenant, actor } = c.var.requestContext
    const scope = [
      tenant.organizationId ?? '-',
      tenant.spaceId ?? '-',
      actorKey(actor),
      c.req.method,
      c.req.routePath,
    ].join('|')
    const url = new URL(c.req.url)
    const body = await c.req.raw.clone().text()
    const requestHash = await sha256(`${c.req.method}\n${url.pathname}${url.search}\n${body}`)

    const { replayed, result } = await c.var.services.get(IDEMPOTENCY).run<StoredResponse>(
      scope,
      key,
      requestHash,
      async () => {
        await next()
        return {
          status: c.res.status,
          contentType: c.res.headers.get('content-type'),
          body: await c.res.clone().text(),
        }
      },
      { shouldStore: (response) => response.status < 500 },
    )
    if (!replayed) return undefined
    const headers = new Headers({ 'idempotent-replayed': 'true' })
    if (result.contentType !== null) headers.set('content-type', result.contentType)
    return new Response(result.body === '' ? null : result.body, { status: result.status, headers })
  }
}

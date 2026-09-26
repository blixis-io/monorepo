import { createServiceToken, type ServiceToken } from '@blixis/contracts'
import { stripIgnoredCharacters } from 'graphql'
import type { CachedResponse, ResponseCacheStore } from './cache.ts'
import type { GraphQLContext } from './context.ts'

/**
 * Decides whether a request may use the response cache (ADR 0012 §3) and returns its scope — a
 * string that must change whenever the content it could return changes (e.g. `space:env:stamp`).
 * `undefined` bypasses the cache. Provided by the module that owns the data (`@blixis/content`).
 */
export type CachePolicy = (
  context: GraphQLContext & { readonly request: Request },
) => Promise<string | undefined>

/** Optional request-scoped {@link CachePolicy}. Without one, nothing is cached. */
export const GRAPHQL_CACHE_POLICY: ServiceToken<CachePolicy> = createServiceToken<CachePolicy>(
  '@blixis/graphql.cache-policy',
)

/** The parts of a GraphQL request that determine its result. */
interface Operation {
  readonly query?: string
  readonly persistedHash?: string
  readonly operationName?: string
  readonly variables?: unknown
}

/** Reads the operation from a GET (query string) or POST (JSON) request; `undefined` if unreadable. */
export async function readOperation(request: Request): Promise<Operation | undefined> {
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url)
      const parse = (name: string) => {
        const value = url.searchParams.get(name)
        return value === null ? undefined : JSON.parse(value)
      }
      return toOperation({
        query: url.searchParams.get('query') ?? undefined,
        operationName: url.searchParams.get('operationName') ?? undefined,
        variables: parse('variables'),
        extensions: parse('extensions'),
      })
    }
    if (request.method === 'POST')
      return toOperation((await request.clone().json()) as Record<string, unknown>)
  } catch {
    // Malformed requests are left to Yoga, uncached.
  }
  return undefined
}

function toOperation(body: Record<string, unknown>): Operation | undefined {
  const extensions = body['extensions'] as { persistedQuery?: { sha256Hash?: unknown } } | undefined
  const hash = extensions?.persistedQuery?.sha256Hash
  const query = typeof body['query'] === 'string' ? body['query'] : undefined
  if (query === undefined && typeof hash !== 'string') return undefined
  return {
    ...(query === undefined ? {} : { query }),
    ...(typeof hash === 'string' ? { persistedHash: hash } : {}),
    ...(typeof body['operationName'] === 'string' ? { operationName: body['operationName'] } : {}),
    ...(body['variables'] === undefined || body['variables'] === null
      ? {}
      : { variables: body['variables'] }),
  }
}

/** JSON with object keys sorted, so equal variables give equal keys. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/** Cache key for an operation in a scope (ADR 0012 §4). Credentials are never part of it. */
export async function cacheKey(scope: string, operation: Operation): Promise<string> {
  let document = operation.persistedHash === undefined ? '' : `apq:${operation.persistedHash}`
  if (operation.query !== undefined) {
    try {
      document = stripIgnoredCharacters(operation.query)
    } catch {
      document = operation.query.trim()
    }
  }
  return sha256(
    canonical([scope, operation.operationName ?? null, document, operation.variables ?? null]),
  )
}

export const etagOf = async (body: string) => `"${(await sha256(body)).slice(0, 32)}"`

/** Response headers for cacheable delivery responses (ADR 0012 §6). */
export function cacheHeaders(
  cached: CachedResponse,
  status: 'HIT' | 'MISS',
  maxAge: number,
): Headers {
  return new Headers({
    'content-type': cached.contentType,
    etag: cached.etag,
    'cache-control':
      maxAge > 0 ? `public, max-age=${maxAge}` : 'public, max-age=0, must-revalidate',
    vary: 'Authorization, X-Blixis-Environment',
    'x-blixis-cache': status,
  })
}

/** Whether a fresh response may be stored: 200, JSON, no errors, not marked private. */
export function storable(response: Response, body: string): boolean {
  if (response.status !== 200) return false
  if (!(response.headers.get('content-type') ?? '').includes('json')) return false
  if ((response.headers.get('cache-control') ?? '').includes('private')) return false
  try {
    const parsed = JSON.parse(body) as { errors?: unknown }
    return parsed.errors === undefined
  } catch {
    return false
  }
}

export type { ResponseCacheStore }

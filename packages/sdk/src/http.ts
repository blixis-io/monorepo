import { BlixisApiError } from './errors.ts'
import type { BinaryBody } from './generated/api.ts'

/** Options shared by the SDK clients. */
export interface HttpOptions {
  /** The API's origin, e.g. `https://api.example.com` (paths are added by the SDK). */
  readonly baseUrl: string
  /** A bearer token: an API token (`blx_pat_…`) or an access token; a delivery/preview key for GraphQL. */
  readonly token?: string | undefined
  /** Replace `fetch`, e.g. for tests or instrumentation. Default: the global `fetch`. */
  readonly fetch?: ((request: Request) => Promise<Response>) | undefined
  /** Per-attempt timeout in milliseconds. Default 30 000. */
  readonly timeoutMs?: number | undefined
  /**
   * Retries of `429` and `502`/`503`/`504` answers and network errors, for requests that are safe to
   * repeat (GET, PUT, DELETE, and commands with an `Idempotency-Key`). Default 2.
   */
  readonly retries?: number | undefined
}

export interface HttpRequest {
  readonly method: string
  readonly path: string
  readonly query?: Readonly<Record<string, unknown>> | undefined
  readonly json?: unknown
  readonly binary?: BinaryBody | undefined
  readonly headers?: Readonly<Record<string, string>> | undefined
  /** Anonymous call (e.g. sign-in): no `Authorization` header. */
  readonly anonymous?: boolean | undefined
}

const RETRYABLE = new Set([429, 502, 503, 504])
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** Seconds (or an HTTP date) from `Retry-After`, as milliseconds; `undefined` if absent. */
function retryAfter(response: Response): number | undefined {
  const value = response.headers.get('retry-after')
  if (value === null) return undefined
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000)
  const date = Date.parse(value)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

/** A fetch-based HTTP core: URLs, auth, timeouts, retries with backoff, and error mapping. */
export function createHttp(options: HttpOptions) {
  const base = options.baseUrl.replace(/\/+$/, '')
  const doFetch = options.fetch ?? ((request: Request) => fetch(request))
  const retries = options.retries ?? 2

  function url(path: string, query: HttpRequest['query']) {
    const target = new URL(`${base}${path}`)
    for (const [name, value] of Object.entries(query ?? {}))
      if (value !== undefined && value !== null) target.searchParams.set(name, String(value))
    return target.toString()
  }

  /** Sends a request and returns the raw response (throws `BlixisApiError` for non-2xx). */
  async function send(request: HttpRequest): Promise<Response> {
    const headers = new Headers(request.headers)
    headers.set('accept', 'application/json')
    if (!request.anonymous && options.token !== undefined)
      headers.set('authorization', `Bearer ${options.token}`)
    let body: BodyInit | undefined
    if (request.binary !== undefined) {
      body = request.binary as BodyInit
      // The API needs the exact size of uploads (it streams them); set it when it's known.
      const size =
        request.binary instanceof Blob
          ? request.binary.size
          : request.binary instanceof ArrayBuffer || ArrayBuffer.isView(request.binary)
            ? request.binary.byteLength
            : undefined
      if (size !== undefined && !headers.has('content-length'))
        headers.set('content-length', String(size))
    } else if (request.json !== undefined) {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(request.json)
    }
    const repeatable =
      ['GET', 'HEAD', 'PUT', 'DELETE'].includes(request.method) || headers.has('idempotency-key')
    // A stream can be sent once only.
    const attempts = request.binary instanceof ReadableStream || !repeatable ? 1 : retries + 1

    for (let attempt = 1; ; attempt++) {
      let response: Response
      try {
        response = await doFetch(
          new Request(url(request.path, request.query), {
            method: request.method,
            headers,
            ...(body === undefined ? {} : { body }),
            ...(request.binary instanceof ReadableStream ? { duplex: 'half' } : {}),
            signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
          } as RequestInit),
        )
      } catch (error) {
        if (attempt < attempts) {
          await sleep(backoff(attempt))
          continue
        }
        throw new BlixisApiError(
          error instanceof Error && error.name === 'TimeoutError'
            ? 'The request timed out'
            : 'The request failed',
          { status: 0, code: 'NETWORK_ERROR', cause: error },
        )
      }
      if (response.ok || response.status === 304) return response
      if (attempt < attempts && RETRYABLE.has(response.status)) {
        await response.body?.cancel().catch(() => undefined)
        await sleep(retryAfter(response) ?? backoff(attempt))
        continue
      }
      throw await BlixisApiError.fromResponse(response)
    }
  }

  /** Sends a request and parses the JSON answer (`undefined` for empty bodies). */
  async function json<T>(request: HttpRequest): Promise<T> {
    const response = await send(request)
    const text = await response.text()
    return (text === '' ? undefined : JSON.parse(text)) as T
  }

  return { send, json, url }
}

/** Exponential backoff with jitter: ~250 ms, 500 ms, 1 s, … */
const backoff = (attempt: number) => 250 * 2 ** (attempt - 1) * (0.5 + Math.random())

export type Http = ReturnType<typeof createHttp>

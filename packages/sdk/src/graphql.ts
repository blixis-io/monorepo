import { BlixisApiError, type BlixisErrorCode } from './errors.ts'
import { createHttp, type HttpOptions } from './http.ts'

/**
 * A GraphQL document with its result and variable types — e.g. from GraphQL Codegen's client
 * preset with `documentMode: 'string'` — or a plain string (then types are yours to give).
 */
export type TypedDocument<TData = Record<string, unknown>, TVariables = Record<string, unknown>> = (
  | string
  | { toString(): string }
) & { readonly __apiType?: (variables: TVariables) => TData }

type Untyped = Record<string, unknown>
/** Result type of a document; plain strings give `Record<string, unknown>`. */
type DataOf<D> = D extends { readonly __apiType?: (variables: never) => infer R }
  ? unknown extends R
    ? Untyped
    : R
  : Untyped
type VariablesOf<D> = D extends { readonly __apiType?: (variables: infer V) => unknown }
  ? unknown extends V
    ? Untyped
    : V
  : Untyped

/** One error of a GraphQL response. */
export interface GraphQLErrorItem {
  readonly message: string
  readonly path?: readonly (string | number)[]
  readonly extensions?: { readonly code?: string; readonly [key: string]: unknown }
}

/** Options of {@link createBlixisGraphQLClient}. */
export interface GraphQLClientOptions extends HttpOptions {
  /**
   * Automatic persisted queries: send only the query's SHA-256 first (a short GET that CDNs and
   * the delivery cache can serve), and the full query once when the server doesn't know it yet.
   * Default `true`.
   */
  readonly persistedQueries?: boolean | undefined
  /** Send queries as GET (cacheable); mutations are always POST. Default `true`. */
  readonly get?: boolean | undefined
  /** Environment key (`X-Blixis-Environment`); default the space's default environment. */
  readonly environment?: string | undefined
  /** Space id — only for member tokens; delivery and preview keys belong to one space. */
  readonly space?: string | undefined
}

/** Per-query options, passed as the `$preview` and `$locale` variables when set. */
export interface QueryOptions {
  /** Read drafts (needs a preview key or preview access): sets `$preview`. */
  readonly preview?: boolean | undefined
  /** Sets `$locale`, e.g. `nl-NL`. */
  readonly locale?: string | undefined
  /** Extra request headers. */
  readonly headers?: Readonly<Record<string, string>> | undefined
}

const hex = (buffer: ArrayBuffer) =>
  [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('')

/** Maps GraphQL error codes (`extensions.code`) to the SDK's codes. */
const code = (value: string | undefined): BlixisErrorCode => {
  switch (value) {
    case 'VALIDATION_FAILED':
    case 'NOT_FOUND':
    case 'CONFLICT':
    case 'FORBIDDEN':
    case 'UNAUTHORIZED':
    case 'RATE_LIMITED':
    case 'INFRASTRUCTURE_ERROR':
      return value
    case 'QUERY_TOO_COMPLEX':
    case 'GRAPHQL_VALIDATION_FAILED':
    case 'GRAPHQL_PARSE_FAILED':
    case 'BAD_USER_INPUT':
      return 'VALIDATION_FAILED'
    default:
      return 'INTERNAL'
  }
}

/**
 * A client for the GraphQL delivery API (`/graphql`, plan 012) with a delivery key (`blx_dk_…`)
 * or, server-side only, a preview key (`blx_pk_…`).
 *
 * @example
 * const delivery = createBlixisGraphQLClient({ baseUrl, token: env.BLIXIS_DELIVERY_KEY })
 * const { pageCollection } = await delivery.query(
 *   'query Pages($locale: Locale) { pageCollection(locale: $locale) { items { title } } }',
 *   {},
 *   { locale: 'nl-NL' },
 * )
 */
export function createBlixisGraphQLClient(options: GraphQLClientOptions) {
  const http = createHttp(options)
  const apq = options.persistedQueries !== false
  const useGet = options.get !== false
  const hashes = new Map<string, Promise<string>>()
  const hashOf = (query: string) => {
    let hash = hashes.get(query)
    if (hash === undefined) {
      hash = crypto.subtle.digest('SHA-256', new TextEncoder().encode(query)).then(hex)
      hashes.set(query, hash)
    }
    return hash
  }

  async function execute(
    body: { query?: string; variables: Record<string, unknown>; extensions?: unknown },
    method: 'GET' | 'POST',
    headers: Record<string, string>,
  ) {
    const query: Record<string, string> = {}
    if (method === 'GET') {
      if (body.query !== undefined) query['query'] = body.query
      if (Object.keys(body.variables).length > 0)
        query['variables'] = JSON.stringify(body.variables)
      if (body.extensions !== undefined) query['extensions'] = JSON.stringify(body.extensions)
      if (options.space !== undefined) query['space'] = options.space
    }
    const response = await http.send({
      method,
      path: '/graphql',
      ...(method === 'GET'
        ? { query }
        : { json: body, query: options.space === undefined ? {} : { space: options.space } }),
      headers,
      raw: true,
    })
    const type = response.headers.get('content-type') ?? ''
    if (type.includes('json')) {
      const body = (await response.json()) as { data?: unknown; errors?: GraphQLErrorItem[] }
      if (body.errors !== undefined || response.ok) return body
    }
    // Not a GraphQL answer (e.g. a problem-details 401 or 413).
    throw await BlixisApiError.fromResponse(response)
  }

  /**
   * Runs a query and returns its `data`. Throws `BlixisApiError` when the response has errors
   * (`code` from the first error's `extensions.code`, all of them in `details`).
   */
  async function query<D extends TypedDocument>(
    document: D,
    variables: VariablesOf<D> = {} as VariablesOf<D>,
    queryOptions: QueryOptions = {},
  ): Promise<DataOf<D>> {
    const text = String(document)
    const vars: Record<string, unknown> = {
      ...(variables as Record<string, unknown>),
      ...(queryOptions.preview === undefined ? {} : { preview: queryOptions.preview }),
      ...(queryOptions.locale === undefined ? {} : { locale: queryOptions.locale }),
    }
    const headers: Record<string, string> = {
      ...queryOptions.headers,
      ...(options.environment === undefined ? {} : { 'x-blixis-environment': options.environment }),
    }
    const isMutation = /^\s*mutation\b/.test(text)
    const method = useGet && !isMutation ? 'GET' : 'POST'
    let result: { data?: unknown; errors?: GraphQLErrorItem[] }
    if (apq) {
      const extensions = { persistedQuery: { version: 1, sha256Hash: await hashOf(text) } }
      result = await execute({ variables: vars, extensions }, method, headers)
      if (result.errors?.some((e) => e.message === 'PersistedQueryNotFound'))
        // Register once with the full query; later calls send the hash only.
        result = await execute({ query: text, variables: vars, extensions }, 'POST', headers)
    } else result = await execute({ query: text, variables: vars }, method, headers)
    if (result.errors !== undefined && result.errors.length > 0) {
      const [first] = result.errors
      throw new BlixisApiError(first?.message ?? 'GraphQL error', {
        status: 200,
        code: code(first?.extensions?.code),
        details: { errors: result.errors, data: result.data },
      })
    }
    return result.data as DataOf<D>
  }

  return { query }
}

/** A client from {@link createBlixisGraphQLClient}. */
export type BlixisGraphQLClient = ReturnType<typeof createBlixisGraphQLClient>

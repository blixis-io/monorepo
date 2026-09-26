import { defineModule } from '@blixis/kernel'
import { asUser, createTestBlixis, type TestBlixis } from '@blixis/testing'
import { describe, expect, it } from 'vitest'
import type { GraphQLContext } from './context.ts'
import { graphqlModule } from './module.ts'
import { type CachePolicy, GRAPHQL_CACHE_POLICY } from './response-cache.ts'

let calls = 0
const counter = defineModule({
  meta: { name: '@acme/counter', version: '1.0.0' },
  graphql: {
    typeDefs:
      'extend type Query { count(by: Int, label: String): Int! failing: Int! secret: Int! }',
    resolvers: {
      Query: {
        count: (_p: unknown, args: { by?: number }) => {
          calls++
          return calls * (args.by ?? 1)
        },
        failing: () => {
          throw new Error('boom')
        },
        secret: (_p: unknown, _a: unknown, context: GraphQLContext) => {
          context.responseHeaders.set('cache-control', 'private, no-store')
          return 42
        },
      },
    },
  },
})
/** Scope from a test header; no header → bypass. */
const policy = defineModule({
  meta: { name: '@acme/policy', version: '1.0.0' },
  setup(ctx) {
    ctx.services.provideFactory(
      GRAPHQL_CACHE_POLICY,
      (): CachePolicy =>
        async ({ request }) =>
          request.headers.get('x-test-scope') ?? undefined,
      { scope: 'request' },
    )
  },
})

async function setup() {
  calls = 0
  return createTestBlixis({ modules: [graphqlModule(), counter(), policy()] })
}
async function post(
  t: TestBlixis,
  body: object,
  headers: Record<string, string> = { 'x-test-scope': 'space-a:1' },
) {
  const res = await t.request('/graphql', {
    method: 'POST',
    actor: asUser('u1'),
    json: body,
    headers,
  })
  const text = await res.text()
  return {
    status: res.status,
    cache: res.headers.get('x-blixis-cache'),
    etag: res.headers.get('etag'),
    cc: res.headers.get('cache-control'),
    body: text === '' ? undefined : JSON.parse(text),
  }
}

describe('GraphQL response cache', () => {
  it('misses, then hits, with ETags and 304 revalidation', async () => {
    const t = await setup()
    const first = await post(t, { query: '{ count }' })
    expect(first).toMatchObject({
      status: 200,
      cache: 'MISS',
      cc: 'public, max-age=0, must-revalidate',
      body: { data: { count: 1 } },
    })
    const second = await post(t, { query: '{ count }' })
    expect(second).toMatchObject({ cache: 'HIT', body: { data: { count: 1 } }, etag: first.etag })
    expect(calls).toBe(1)
    const notModified = await post(
      t,
      { query: '{ count }' },
      { 'x-test-scope': 'space-a:1', 'if-none-match': first.etag ?? '' },
    )
    expect(notModified.status).toBe(304)
    expect(notModified.body).toBeUndefined()
  })

  it('normalises documents and variables, and separates scopes', async () => {
    const t = await setup()
    await post(t, {
      query: 'query Q($by: Int, $label: String) { count(by: $by, label: $label) }',
      variables: { by: 2, label: 'x' },
    })
    const same = await post(t, {
      query: 'query Q($by:Int,$label:String){  count(by:$by,label:$label)  }',
      variables: { label: 'x', by: 2 },
    })
    expect(same.cache).toBe('HIT')
    expect((await post(t, { query: '{ count }' }, { 'x-test-scope': 'space-b:1' })).cache).toBe(
      'MISS',
    )
    // A new stamp in the scope means a new key: fresh results after a publish.
    expect((await post(t, { query: '{ count }' }, { 'x-test-scope': 'space-a:2' })).cache).toBe(
      'MISS',
    )
  })

  it('never caches errors, private responses, or requests without a scope', async () => {
    const t = await setup()
    const failing = await post(t, { query: '{ failing }' })
    expect(failing.cache).toBe('BYPASS')
    expect((await post(t, { query: '{ failing }' })).cache).toBe('BYPASS')
    const secret = await post(t, { query: '{ secret }' })
    expect(secret.cache).toBe('BYPASS')
    expect(secret.cc).toBe('private, no-store')
    expect((await post(t, { query: '{ count }' }, {})).cache).toBe('BYPASS')
    expect((await post(t, { query: '{ count }' }, {})).cache).toBe('BYPASS')
  })

  it('caches GET queries and automatic persisted queries', async () => {
    const t = await setup()
    const get = (query: string) =>
      t.request(`/graphql?query=${encodeURIComponent(query)}`, {
        actor: asUser('u1'),
        headers: { 'x-test-scope': 'space-a:1', accept: 'application/json' },
      })
    expect((await get('{ count }')).headers.get('x-blixis-cache')).toBe('MISS')
    expect((await get('{ count }')).headers.get('x-blixis-cache')).toBe('HIT')

    const query = '{ count(by: 10) }'
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(query))
    const sha256Hash = [...new Uint8Array(digest)]
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
    const extensions = { persistedQuery: { version: 1, sha256Hash } }
    const unknown = await post(t, { extensions })
    expect(unknown.body.errors[0].message).toBe('PersistedQueryNotFound')
    expect(unknown.cache).toBe('BYPASS')
    expect((await post(t, { query, extensions })).body.data).toEqual({ count: 20 })
    const byHash = await post(t, { extensions })
    expect(byHash.body.data).toEqual({ count: 30 })
    expect((await post(t, { extensions })).cache).toBe('HIT')
  })
})

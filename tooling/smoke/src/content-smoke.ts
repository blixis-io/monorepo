#!/usr/bin/env node
/**
 * Content smoke test against a deployed API (roadmap 011.007): models a component and a page,
 * creates, updates, publishes, reads, and cleans up an entry — timing every request.
 *
 *   BLIXIS_API_URL=https://blixis-api-staging…/api/v1 \
 *   BLIXIS_TOKEN=<access token or blx_pat_… with content.* and spaces.read scopes> \
 *   BLIXIS_SPACE_ID=<space id> \
 *   pnpm --filter @blixis/smoke content
 *
 * Everything it creates uses a unique suffix and is deleted at the end, also after a failure.
 */
import process from 'node:process'

const api = process.env['BLIXIS_API_URL']?.replace(/\/$/, '')
const token = process.env['BLIXIS_TOKEN']
const spaceId = process.env['BLIXIS_SPACE_ID']
if (api === undefined || token === undefined || spaceId === undefined) {
  console.error('Set BLIXIS_API_URL, BLIXIS_TOKEN, and BLIXIS_SPACE_ID')
  process.exit(2)
}

const suffix = Date.now().toString(36)
const timings: { step: string; status: number; ms: number }[] = []

async function request<T>(
  step: string,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const started = performance.now()
  const res = await fetch(`${api}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  const ms = Math.round(performance.now() - started)
  timings.push({ step, status: res.status, ms })
  const text = await res.text()
  if (!res.ok) throw new Error(`${step}: ${method} ${path} → ${res.status} ${text.slice(0, 300)}`)
  return (text === '' ? undefined : JSON.parse(text)) as T
}

interface Entry {
  sys: { id: string; version: number; status: string }
  fields: Record<string, unknown>
}

const cleanup: (() => Promise<unknown>)[] = []
let failed = false
try {
  const hero = await request<{ id: string }>(
    'create component',
    'POST',
    `/spaces/${spaceId}/content-types`,
    {
      kind: 'component',
      apiId: `smokeHero${suffix}`,
      name: `Smoke hero ${suffix}`,
      fields: [{ apiId: 'heading', name: 'Heading', type: 'text', required: true }],
    },
  )
  cleanup.unshift(() =>
    request('delete component', 'DELETE', `/spaces/${spaceId}/content-types/${hero.id}`),
  )
  const page = await request<{ id: string; apiId: string }>(
    'create content type',
    'POST',
    `/spaces/${spaceId}/content-types`,
    {
      apiId: `smokePage${suffix}`,
      name: `Smoke page ${suffix}`,
      fields: [
        { apiId: 'title', name: 'Title', type: 'text', required: true, localized: true },
        { apiId: 'slug', name: 'Slug', type: 'text', required: true, settings: { format: 'slug' } },
        {
          apiId: 'body',
          name: 'Body',
          type: 'blocks',
          localized: true,
          settings: { componentIds: [hero.id] },
        },
      ],
    },
  )
  cleanup.unshift(() =>
    request('delete content type', 'DELETE', `/spaces/${spaceId}/content-types/${page.id}`),
  )

  const heroType = `smokeHero${suffix}`
  const created = await request<Entry>('create entry', 'POST', `/spaces/${spaceId}/entries`, {
    contentType: page.apiId,
    fields: { title: { 'en-US': 'Smoke' }, slug: `smoke-${suffix}` },
  })
  cleanup.unshift(() => request('delete entry', 'DELETE', `/entries/${created.sys.id}`))
  const updated = await request<Entry>(
    'update entry',
    'PATCH',
    `/entries/${created.sys.id}`,
    {
      fields: {
        title: { 'en-US': 'Smoke test' },
        slug: `smoke-${suffix}`,
        body: {
          'en-US': [{ _id: 'sMoke001', _type: heroType, heading: 'Hello from the smoke test' }],
        },
      },
    },
    { 'if-match': `"${created.sys.version}"` },
  )
  const published = await request<Entry>(
    'publish',
    'POST',
    `/entries/${created.sys.id}/publish`,
    {},
    {
      'idempotency-key': `smoke-${suffix}`,
    },
  )
  if (published.sys.status !== 'published')
    throw new Error(`expected published, got ${published.sys.status}`)
  cleanup.unshift(() => request('unpublish', 'POST', `/entries/${created.sys.id}/unpublish`, {}))
  await request(
    'publish (replay)',
    'POST',
    `/entries/${created.sys.id}/publish`,
    {},
    { 'idempotency-key': `smoke-${suffix}` },
  )
  const live = await request<Entry>(
    'read published',
    'GET',
    `/entries/${created.sys.id}?state=published`,
  )
  if (JSON.stringify(live.fields) !== JSON.stringify(updated.fields))
    throw new Error('published fields differ')
  const list = await request<{ entries: Entry[] }>(
    'list by slug',
    'GET',
    `/spaces/${spaceId}/entries?state=published&contentType=${page.apiId}&fields.slug=smoke-${suffix}`,
  )
  if (list.entries.length !== 1)
    throw new Error(`expected 1 listed entry, got ${list.entries.length}`)
  await request('versions', 'GET', `/entries/${created.sys.id}/versions`)
} catch (error) {
  failed = true
  console.error(error instanceof Error ? error.message : error)
} finally {
  for (const step of cleanup) {
    try {
      await step()
    } catch (error) {
      failed = true
      console.error('cleanup:', error instanceof Error ? error.message : error)
    }
  }
}

const width = Math.max(...timings.map((t) => t.step.length))
for (const t of timings)
  console.log(`${t.step.padEnd(width)}  ${t.status}  ${String(t.ms).padStart(5)} ms`)
const sorted = timings.map((t) => t.ms).sort((a, b) => a - b)
const p50 = sorted[Math.floor(sorted.length / 2)] ?? 0
console.log(
  `\n${timings.length} requests, p50 ${p50} ms, max ${sorted.at(-1) ?? 0} ms — ${failed ? 'FAILED' : 'OK'}`,
)
process.exit(failed ? 1 : 0)

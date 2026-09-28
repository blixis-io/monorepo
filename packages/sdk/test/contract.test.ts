import { eventsModule } from '@blixis-io/events'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis-io/testing/database'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BlixisApiError, createBlixisClient } from '../src/index.ts'
import { apiModules, createApi } from './harness.ts'

/**
 * Contract tests (plan 017.002): the SDK against the real API modules, with every response
 * checked against the documented operation schemas.
 */
describe.skipIf(!databaseTestsEnabled())('SDK ↔ Management API (contract)', () => {
  let db: TestDatabase
  let api: Awaited<ReturnType<typeof createApi>>
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...apiModules(), eventsModule()] })
    api = await createApi(db)
  })
  afterAll(async () => {
    expect(api.violations).toEqual([])
    // The schema checks really ran, across many operations.
    expect(api.seen.size).toBeGreaterThanOrEqual(15)
    await db.drop()
  })

  const anonymous = () => createBlixisClient({ baseUrl: api.baseUrl, fetch: api.fetch })
  async function signedIn(email: string) {
    const session = await anonymous().call('signUp', {
      body: { email, displayName: 'SDK', password: 'correct horse battery', tokenDelivery: 'body' },
    })
    return createBlixisClient({
      baseUrl: api.baseUrl,
      fetch: api.fetch,
      token: session.accessToken,
    })
  }

  it('space → content type → entry → publish, and paging through entries', async () => {
    const blixis = await signedIn('flow@example.com')
    const org = await blixis.organizations.create({ name: 'SDK Org', slug: 'sdk-org' })
    const space = await blixis.spaces.create(org.id, { name: 'Site', slug: 'site' })
    expect(space.environments).toHaveLength(1)
    const page = await blixis.contentTypes.create(space.id, {
      apiId: 'page',
      name: 'Page',
      fields: [
        { apiId: 'title', name: 'Title', type: 'text', required: true },
        { apiId: 'slug', name: 'Slug', type: 'text' },
      ],
    })
    expect(page.fields.map((f) => f.apiId)).toEqual(['title', 'slug'])

    const draft = await blixis.entries.create(space.id, 'page', { title: 'Home', slug: 'home' })
    expect(draft.sys).toMatchObject({ status: 'draft', version: 1 })
    const edited = await blixis.entries.update(draft.sys.id, { title: 'Welcome', slug: 'home' }, 1)
    expect(edited.sys.version).toBe(2)
    const published = await blixis.entries.publish(draft.sys.id, { version: 2 })
    expect(published.sys.status).toBe('published')
    // Retrying a command with the same key is safe.
    const again = await blixis.entries.publish(draft.sys.id, { idempotencyKey: 'publish-home' })
    expect(again.sys.status).toBe('published')

    for (const title of ['About', 'Contact'])
      await blixis.entries.create(space.id, 'page', { title })
    const titles: unknown[] = []
    for await (const entry of blixis.entries.iterate(space.id, { contentType: 'page', limit: 1 }))
      titles.push(entry.fields['title'])
    expect(titles).toEqual(['Contact', 'About', 'Welcome'])
    const live = await blixis.entries.list(space.id, { state: 'published' })
    expect(live.entries.map((e) => e.fields['title'])).toEqual(['Welcome'])
  })

  it('uploads assets and manages webhooks and delivery keys', async () => {
    const blixis = await signedIn('assets@example.com')
    const org = await blixis.organizations.create({ name: 'Assets', slug: 'assets-org' })
    const space = await blixis.spaces.create(org.id, { name: 'Media', slug: 'media' })
    const file = new Blob(['hello from the SDK'], { type: 'text/plain' })
    const asset = await blixis.assets.upload(space.id, file, { filename: 'hello.txt' })
    expect(asset.fields).toMatchObject({
      filename: 'hello.txt',
      size: file.size,
      mimeType: 'text/plain',
    })
    expect((await blixis.assets.publish(asset.sys.id)).sys.status).toBe('published')
    const listed = []
    for await (const a of blixis.assets.iterate(space.id)) listed.push(a.sys.id)
    expect(listed).toEqual([asset.sys.id])

    const { webhook, secret } = await blixis.webhooks.create(space.id, {
      name: 'Build',
      url: 'https://ci.example.com/hook',
      eventTypes: ['entry.published'],
    })
    expect(secret).toMatch(/^whsec_/)
    const ping = await blixis.webhooks.test(webhook.id)
    expect(ping.eventType).toBe('webhook.ping')
    expect((await blixis.webhooks.deliveries(webhook.id)).deliveries).toHaveLength(1)

    const key = await blixis.deliveryKeys.create(space.id, { name: 'Site', kind: 'delivery' })
    expect(key.key).toMatch(/^blx_dk_/)
    expect(await blixis.deliveryKeys.list(space.id)).toHaveLength(1)
  })

  it('surfaces error codes, validation issues, and request ids', async () => {
    const blixis = await signedIn('errors@example.com')
    const missing = await blixis.entries.get('01a0d8f9-0000-7000-8000-000000000000').catch((e) => e)
    expect(missing).toBeInstanceOf(BlixisApiError)
    expect(missing).toMatchObject({ status: 404, code: 'NOT_FOUND' })
    expect(missing.requestId).toMatch(/.+/)

    const invalid = await blixis.organizations
      .create({ name: '', slug: 'Not A Slug' })
      .catch((e) => e)
    expect(invalid).toMatchObject({ status: 400, code: 'VALIDATION_FAILED' })
    expect(invalid.errors.map((e: { path: unknown[] }) => e.path[0])).toContain('slug')

    const unauthenticated = await anonymous()
      .organizations.list()
      .catch((e) => e)
    expect(unauthenticated).toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
  })
})

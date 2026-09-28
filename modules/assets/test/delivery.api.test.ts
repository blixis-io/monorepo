import { OBJECT_STORAGE } from '@blixis-io/contracts'
import { databaseModule } from '@blixis-io/database'
import { eventsModule } from '@blixis-io/events'
import { permissionsModule } from '@blixis-io/permissions'
import { spacesModule, TENANCY_SERVICE } from '@blixis-io/spaces'
import {
  asDeliveryKey,
  asUser,
  captureEvents,
  createMemoryObjectStorage,
  createTestBlixis,
  serviceOverride,
} from '@blixis-io/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis-io/testing/database'
import { USER_SERVICE, usersModule } from '@blixis-io/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type AssetView, assetsModule } from '../src/index.ts'
import { parseRange } from '../src/rest/delivery.routes.ts'
import { png } from './fixtures.ts'

describe('parseRange', () => {
  it('reads single byte ranges and rejects unsatisfiable ones', () => {
    expect(parseRange('bytes=0-3', 10)).toEqual({ offset: 0, length: 4 })
    expect(parseRange('bytes=4-', 10)).toEqual({ offset: 4, length: 6 })
    expect(parseRange('bytes=-3', 10)).toEqual({ offset: 7, length: 3 })
    expect(parseRange('bytes=-30', 10)).toEqual({ offset: 0, length: 10 })
    expect(parseRange('bytes=8-100', 10)).toEqual({ offset: 8, length: 2 })
    expect(parseRange('bytes=10-', 10)).toBe('unsatisfiable')
    expect(parseRange('bytes=-0', 10)).toBe('unsatisfiable')
    expect(parseRange('bytes=5-2', 10)).toBe('unsatisfiable')
    expect(parseRange('bytes=0-1,4-5', 10)).toBeUndefined()
    expect(parseRange('items=0-1', 10)).toBeUndefined()
    expect(parseRange(undefined, 10)).toBeUndefined()
  })
})

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  assetsModule({ deliveryMaxAge: 600 }),
]

describe.skipIf(!databaseTestsEnabled())('asset delivery route (Postgres, memory storage)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const t = await createTestBlixis({
      modules: [...modules(), captureEvents().module()],
      database: db,
      overrides: [serviceOverride(OBJECT_STORAGE, createMemoryObjectStorage())],
    })
    const seeded = await t.app.runInScope({}, async ({ services }) => {
      const owner = asUser(
        (await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' })).id,
      )
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' })
      const other = await tenancy.createSpace(owner, org.id, { name: 'Other', slug: 'other' })
      return { owner, org, space, other }
    })
    const upload = async (
      bytes: Uint8Array,
      type: string,
      name: string,
      path?: string,
      etag?: string,
    ) => {
      const res = await t.request(path ?? `/api/v1/spaces/${seeded.space.id}/assets`, {
        method: path === undefined ? 'POST' : 'PUT',
        actor: seeded.owner,
        body: bytes as Uint8Array<ArrayBuffer>,
        headers: {
          'content-type': type,
          'content-length': String(bytes.length),
          'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
          ...(etag === undefined ? {} : { 'if-match': etag }),
        },
      })
      expect(res.status).toBeLessThan(300)
      return (await res.json()) as AssetView
    }
    const publish = (id: string) =>
      t.request(`/api/v1/assets/${id}/publish`, { method: 'POST', actor: seeded.owner })
    return { t, upload, publish, ...seeded }
  }

  it('serves drafts only to preview access, and published files to everyone', async () => {
    const { t, upload, publish, owner, org, space, other } = await setup()
    const file = png(12, 8)
    const asset = await upload(file, 'image/png', 'Team photo.png')
    const url = asset.fields.url ?? ''
    expect(url).toMatch(
      new RegExp(`^/assets/${space.id}/${asset.sys.id}/[0-9a-f-]{36}/Team%20photo\\.png$`),
    )
    const tenant = { organizationId: org.id, spaceId: space.id }
    // Draft: 404 for anonymous callers, delivery keys, and other spaces' preview keys.
    expect((await t.request(url)).status).toBe(404)
    expect((await t.request(url, { actor: asDeliveryKey(tenant) })).status).toBe(404)
    expect(
      (await t.request(url, { actor: asDeliveryKey({ ...tenant, spaceId: other.id }, 'preview') }))
        .status,
    ).toBe(404)
    for (const actor of [owner, asDeliveryKey(tenant, 'preview')]) {
      const res = await t.request(url, { actor })
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('private, no-store')
    }
    // The space in the URL must be the asset's space.
    expect((await t.request(url.replace(space.id, other.id), { actor: owner })).status).toBe(404)

    expect((await publish(asset.sys.id)).status).toBe(200)
    const res = await t.request(url)
    expect(res.status).toBe(200)
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(file)
    expect(Object.fromEntries(res.headers)).toMatchObject({
      'content-type': 'image/png',
      'content-length': String(file.length),
      'cache-control': 'public, max-age=600',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'content-disposition': `inline; filename="Team photo.png"; filename*=UTF-8''Team%20photo.png`,
      'access-control-allow-origin': '*',
      'accept-ranges': 'bytes',
    })
    const etag = res.headers.get('etag') ?? ''
    expect((await t.request(url, { headers: { 'if-none-match': etag } })).status).toBe(304)
  })

  it('answers ranges, HEAD, and downloads non-inline types as attachments', async () => {
    const { t, upload, publish } = await setup()
    const text = new TextEncoder().encode('0123456789')
    const asset = await upload(text, 'text/csv', 'data.csv')
    await publish(asset.sys.id)
    const url = asset.fields.url ?? ''
    const partial = await t.request(url, { headers: { range: 'bytes=2-5' } })
    expect(partial.status).toBe(206)
    expect(partial.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(await partial.text()).toBe('2345')
    const tail = await t.request(url, { headers: { range: 'bytes=-3' } })
    expect(await tail.text()).toBe('789')
    const beyond = await t.request(url, { headers: { range: 'bytes=10-' } })
    expect(beyond.status).toBe(416)
    expect(beyond.headers.get('content-range')).toBe('bytes */10')
    const head = await t.request(url, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(head.headers.get('content-length')).toBe('10')
    expect(await head.text()).toBe('')
    expect((await t.request(url)).headers.get('content-disposition')).toMatch(/^attachment;/)
  })

  it('redirects URLs of replaced files to the current file', async () => {
    const { t, upload, publish } = await setup()
    const first = await upload(new TextEncoder().encode('v1'), 'text/plain', 'a.txt')
    await publish(first.sys.id)
    const second = await upload(
      new TextEncoder().encode('v2'),
      'text/plain',
      'a.txt',
      `/api/v1/assets/${first.sys.id}/file`,
      '"1"',
    )
    expect(second.fields.url).not.toBe(first.fields.url)
    const old = await t.request(first.fields.url ?? '', { redirect: 'manual' })
    expect(old.status).toBe(302)
    expect(old.headers.get('location')).toBe(second.fields.url)
    expect(old.headers.get('cache-control')).toBe('public, max-age=60')
    expect(await (await t.request(second.fields.url ?? '')).text()).toBe('v2')
    expect((await t.request('/assets/not-a-space/x/y/z')).status).toBe(404)
  })
})

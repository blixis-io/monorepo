import { OBJECT_STORAGE } from '@blixis-io/contracts'
import { databaseModule } from '@blixis-io/database'
import { idempotencyModule } from '@blixis-io/database/idempotency'
import { eventsModule } from '@blixis-io/events'
import { permissionsModule } from '@blixis-io/permissions'
import { spacesModule, TENANCY_SERVICE } from '@blixis-io/spaces'
import {
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
import { png } from './fixtures.ts'

const modules = () => [
  databaseModule(),
  idempotencyModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  assetsModule({ maxDirectUploadBytes: 64, multipartPartBytes: 8 }),
]

const sha256 = async (data: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>))
const b64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const hex = (bytes: Uint8Array) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')

describe.skipIf(!databaseTestsEnabled())('Assets API (Postgres, memory storage)', () => {
  let db: TestDatabase
  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
  })
  beforeEach(() => db.reset())
  afterAll(() => db.drop())

  async function setup() {
    const storage = createMemoryObjectStorage({ minPartBytes: 8 })
    const events = captureEvents()
    const t = await createTestBlixis({
      modules: [...modules(), events.module()],
      database: db,
      overrides: [serviceOverride(OBJECT_STORAGE, storage)],
    })
    const { owner, space } = await t.app.runInScope({}, async ({ services }) => {
      const owner = asUser(
        (await services.get(USER_SERVICE).create({ email: 'o@example.com', displayName: 'O' })).id,
      )
      const tenancy = services.get(TENANCY_SERVICE)
      const org = await tenancy.createOrganization(owner, { name: 'Org', slug: 'org' })
      const space = await tenancy.createSpace(owner, org.id, { name: 'Site', slug: 'site' })
      return { owner, space }
    })
    const upload = (
      body: Uint8Array,
      headers: Record<string, string>,
      path = `/api/v1/spaces/${space.id}/assets`,
      method = 'POST',
    ) =>
      t.request(path, {
        method,
        actor: owner,
        body: body as Uint8Array<ArrayBuffer>,
        headers: { 'content-length': String(body.length), ...headers },
      })
    const call = (method: string, path: string, json?: unknown, headers = {}) =>
      t.request(`/api/v1${path}`, {
        method,
        actor: owner,
        headers,
        ...(json === undefined ? {} : { json }),
      })
    return { t, storage, events, owner, space, upload, call }
  }
  const view = async (res: Response) => (await res.json()) as AssetView

  it('uploads a file in one request: measured, sniffed, and stored under an opaque key', async () => {
    const { storage, upload, space, events } = await setup()
    const file = png(40, 30)
    const res = await upload(file, {
      'content-type': 'image/png',
      'content-disposition': `attachment; filename*=UTF-8''logo%20%C3%A9.png`,
    })
    expect(res.status).toBe(201)
    expect(res.headers.get('etag')).toBe('"1"')
    const asset = await view(res)
    expect(asset.sys.status).toBe('draft')
    expect(asset.fields).toMatchObject({
      filename: 'logo é.png',
      mimeType: 'image/png',
      size: file.length,
      width: 40,
      height: 30,
    })
    const [key] = storage.keys()
    expect(key).toMatch(new RegExp(`^${space.id}/${asset.sys.id}/[0-9a-f-]{36}$`))
    expect(events.expectEvent('asset.created').payload).toMatchObject({ objectKey: key })
  })

  it('verifies Content-Digest and leaves nothing behind on a mismatch', async () => {
    const { storage, upload, call, space } = await setup()
    const file = png(1, 1)
    const good = await upload(file, {
      'content-type': 'image/png',
      'content-disposition': 'attachment; filename="a.png"',
      'content-digest': `sha-256=:${b64(await sha256(file))}:`,
    })
    expect((await view(good)).fields.sha256).toBe(hex(await sha256(file)))
    const bad = await upload(file, {
      'content-type': 'image/png',
      'content-disposition': 'attachment; filename="b.png"',
      'content-digest': `sha-256=:${b64(await sha256(new Uint8Array([1])))}:`,
    })
    expect(bad.status).toBe(400)
    expect(await bad.json()).toMatchObject({ errors: [{ path: ['sha256'] }] })
    expect(storage.keys()).toHaveLength(1)
    const pending = await call('GET', `/spaces/${space.id}/assets?state=pending`)
    expect(((await pending.json()) as { assets: unknown[] }).assets).toEqual([])
  })

  it('rejects disguised, blocked, oversized, nameless, and unsized uploads', async () => {
    const { storage, upload } = await setup()
    const script = new TextEncoder().encode('<script>alert(document.cookie)</script>')
    const named = { 'content-disposition': 'attachment; filename="x"' }
    const disguised = await upload(script, { 'content-type': 'image/png', ...named })
    expect(disguised.status).toBe(400)
    expect(await disguised.json()).toMatchObject({
      errors: [{ path: ['mimeType'], message: 'The content is not image/png' }],
    })
    expect((await upload(script, { 'content-type': 'text/html', ...named })).status).toBe(400)
    expect(
      (await upload(new Uint8Array(65), { 'content-type': 'text/plain', ...named })).status,
    ).toBe(400)
    expect((await upload(new Uint8Array(3), { 'content-type': 'text/plain' })).status).toBe(400)
    const unsized = await upload(new Uint8Array(3), {
      'content-type': 'text/plain',
      'content-length': '',
      ...named,
    })
    expect(await unsized.json()).toMatchObject({ errors: [{ path: ['Content-Length'] }] })
    expect(storage.keys()).toEqual([])
  })

  it('manages metadata, publishing, file replacement, and deletion', async () => {
    const { upload, call, storage, space } = await setup()
    const created = await view(
      await upload(new TextEncoder().encode('hello'), {
        'content-type': 'text/plain',
        'content-disposition': 'attachment; filename="a.txt"',
      }),
    )
    const id = created.sys.id
    expect((await call('GET', `/spaces/${space.id}/assets`)).status).toBe(200)
    const patched = await call(
      'PATCH',
      `/assets/${id}`,
      { title: { 'en-US': 'Greeting' } },
      { 'if-match': '"1"' },
    )
    expect(patched.status).toBe(200)
    expect((await view(patched)).fields.title).toEqual({ 'en-US': 'Greeting' })
    expect(
      (await call('PATCH', `/assets/${id}`, { filename: 'b.txt' }, { 'if-match': '"1"' })).status,
    ).toBe(409)

    const replaced = await upload(
      new TextEncoder().encode('hello, world'),
      { 'content-type': 'text/plain', 'if-match': '"2"' },
      `/api/v1/assets/${id}/file`,
      'PUT',
    )
    expect(replaced.status).toBe(200)
    expect((await view(replaced)).fields).toMatchObject({ filename: 'a.txt', size: 12 })
    // The old file goes after the commit (asset.updated → delete-replaced-file).
    expect(storage.keys()).toHaveLength(1)

    expect((await view(await call('POST', `/assets/${id}/publish`))).sys.status).toBe('published')
    expect((await call('DELETE', `/assets/${id}`)).status).toBe(409)
    expect((await view(await call('POST', `/assets/${id}/unpublish`))).sys.status).toBe('draft')
    expect((await call('DELETE', `/assets/${id}`, undefined, { 'if-match': '"2"' })).status).toBe(
      409,
    )
    expect((await call('DELETE', `/assets/${id}`)).status).toBe(204)
    expect((await call('GET', `/assets/${id}`)).status).toBe(404)
  })

  it('uploads large files in parts, validating the plan, and aborts cleanly', async () => {
    const { call, upload, storage, space } = await setup()
    const file = png(7, 9) // 29 bytes → parts of 8, 8, 8, 5
    const started = await call('POST', `/spaces/${space.id}/assets/uploads`, {
      filename: 'big.png',
      mimeType: 'image/png',
      size: file.length,
    })
    expect(started.status).toBe(201)
    const plan = (await started.json()) as { asset: AssetView; partSize: number; partCount: number }
    expect(plan).toMatchObject({ partSize: 8, partCount: 4, asset: { sys: { status: 'pending' } } })
    const id = plan.asset.sys.id
    const part = (n: number, bytes: Uint8Array) =>
      upload(
        bytes,
        { 'content-type': 'application/octet-stream' },
        `/api/v1/assets/${id}/upload/parts/${n}`,
        'PUT',
      )
    expect((await part(1, file.subarray(0, 7))).status).toBe(400)
    expect((await part(5, file.subarray(0, 1))).status).toBe(400)
    const parts = []
    for (let n = 1; n <= 4; n++) {
      const res = await part(n, file.subarray((n - 1) * 8, n * 8))
      expect(res.status).toBe(200)
      parts.push(await res.json())
    }
    expect(
      (await call('POST', `/assets/${id}/upload/complete`, { parts: parts.slice(1) })).status,
    ).toBe(400)
    const done = await call('POST', `/assets/${id}/upload/complete`, { parts })
    expect(done.status).toBe(200)
    // Dimensions come from part 1; here it's shorter than the PNG header (real parts are ≥ 5 MiB).
    expect((await view(done)).fields).toMatchObject({ size: 29, width: null, height: null })
    expect(storage.text(storage.keys()[0] ?? '')?.length).toBe(29)

    const second = (await (
      await call('POST', `/spaces/${space.id}/assets/uploads`, {
        filename: 'x.png',
        mimeType: 'image/png',
        size: 20,
      })
    ).json()) as { asset: AssetView }
    const disguised = await upload(
      new TextEncoder().encode('<html><body>'),
      { 'content-type': 'image/png' },
      `/api/v1/assets/${second.asset.sys.id}/upload/parts/1`,
      'PUT',
    )
    expect(disguised.status).toBe(400)
    expect((await call('DELETE', `/assets/${second.asset.sys.id}/upload`)).status).toBe(204)
    expect(storage.pendingUploads).toBe(0)
    expect((await call('GET', `/assets/${second.asset.sys.id}`)).status).toBe(404)
  })
})

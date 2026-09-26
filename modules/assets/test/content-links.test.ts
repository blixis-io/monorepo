import { CONTENT_SERVICE, CONTENT_TYPE_SERVICE, contentModule } from '@blixis/content'
import { OBJECT_STORAGE } from '@blixis/contracts'
import { databaseModule } from '@blixis/database'
import { eventsModule } from '@blixis/events'
import { graphqlModule } from '@blixis/graphql'
import { permissionsModule } from '@blixis/permissions'
import { LOCALE_SERVICE, spacesModule, TENANCY_SERVICE } from '@blixis/spaces'
import {
  asDeliveryKey,
  asUser,
  captureEvents,
  createMemoryObjectStorage,
  createTestBlixis,
  serviceOverride,
  type TestBlixis,
} from '@blixis/testing'
import {
  createTestDatabase,
  databaseTestsEnabled,
  type TestDatabase,
} from '@blixis/testing/database'
import { USER_SERVICE, usersModule } from '@blixis/users'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ASSET_SERVICE, assetsModule } from '../src/index.ts'
import { png } from './fixtures.ts'

const modules = () => [
  databaseModule(),
  usersModule(),
  spacesModule(),
  permissionsModule(),
  contentModule({ stampTtlMs: 0 }),
  assetsModule(),
  graphqlModule(),
]

const stream = (bytes: Uint8Array) =>
  new Response(bytes as Uint8Array<ArrayBuffer>).body as ReadableStream<Uint8Array>

describe.skipIf(!databaseTestsEnabled())('content ↔ assets (Postgres)', () => {
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
      const tenant = {
        organizationId: org.id,
        spaceId: space.id,
        environmentId: space.environments[0]?.id ?? '',
      }
      await services
        .get(LOCALE_SERVICE)
        .create(owner, tenant, { code: 'nl-NL', fallbackCode: 'en-US' })
      await services.get(CONTENT_TYPE_SERVICE).create(owner, tenant, {
        apiId: 'page',
        name: 'Page',
        fields: [
          { apiId: 'title', name: 'Title', type: 'text' },
          { apiId: 'image', name: 'Image', type: 'asset', settings: { mimeTypes: ['image/*'] } },
          { apiId: 'body', name: 'Body', type: 'richText', settings: { nodes: ['embeddedAsset'] } },
        ],
      })
      const assets = services.get(ASSET_SERVICE)
      const image = await assets.upload(owner, tenant, {
        filename: 'hero.png',
        mimeType: 'image/png',
        size: png(40, 20).length,
        body: stream(png(40, 20)),
        title: { 'en-US': 'Hero image' },
      })
      const pdf = await assets.upload(owner, tenant, {
        filename: 'terms.pdf',
        mimeType: 'application/pdf',
        size: 9,
        body: stream(new TextEncoder().encode('%PDF-1.7\n')),
      })
      return { owner, org, space, tenant, image, pdf }
    })
    const run = <T>(
      fn: (
        services: Parameters<Parameters<TestBlixis['app']['runInScope']>[1]>[0]['services'],
      ) => Promise<T>,
    ) => t.app.runInScope({}, ({ services }) => fn(services))
    return { t, run, ...seeded }
  }

  const body = (assetId: string) => ({
    type: 'doc',
    content: [{ type: 'embeddedAsset', attrs: { id: assetId } }],
  })

  it('checks asset links when publishing: existence, publication, and allowed types', async () => {
    const { run, owner, tenant, image, pdf } = await setup()
    const publishWith = (fields: Record<string, unknown>) =>
      run(async (services) => {
        const content = services.get(CONTENT_SERVICE)
        const entry = await content.create(owner, tenant, { contentType: 'page', fields })
        return content
          .publish(owner, tenant, entry.sys.id)
          .catch((e: { issues?: unknown[] }) => e.issues)
      })
    expect(await publishWith({ image: { type: 'asset', id: pdf.sys.id } })).toEqual([
      expect.objectContaining({
        path: ['fields', 'image'],
        message: expect.stringContaining('unpublished'),
      }),
    ])
    await run((services) => services.get(ASSET_SERVICE).publish(owner, tenant, pdf.sys.id))
    expect(await publishWith({ image: { type: 'asset', id: pdf.sys.id } })).toEqual([
      {
        path: ['fields', 'image'],
        message: 'Links to a application/pdf asset, which this field does not allow',
      },
    ])
    expect(
      await publishWith({ image: { type: 'asset', id: '01a0d8f9-0000-7000-8000-000000000000' } }),
    ).toEqual([{ path: ['fields', 'image'], message: 'Links to an asset that does not exist' }])
    expect(await publishWith({ body: body(image.sys.id) })).toEqual([
      expect.objectContaining({ message: 'Links to an unpublished asset: publish it first' }),
    ])
    await run((services) => services.get(ASSET_SERVICE).publish(owner, tenant, image.sys.id))
    const published = await publishWith({
      image: { type: 'asset', id: image.sys.id },
      body: body(image.sys.id),
    })
    expect(published).toMatchObject({ sys: { status: 'published' } })
  })

  it('delivers asset details over GraphQL and keeps cached responses fresh', async () => {
    const { t, run, owner, org, space, tenant, image } = await setup()
    await run(async (services) => {
      await services.get(ASSET_SERVICE).publish(owner, tenant, image.sys.id)
      const content = services.get(CONTENT_SERVICE)
      const entry = await content.create(owner, tenant, {
        contentType: 'page',
        fields: {
          title: 'Home',
          image: { type: 'asset', id: image.sys.id },
          body: body(image.sys.id),
        },
      })
      await content.publish(owner, tenant, entry.sys.id)
    })
    const key = asDeliveryKey({ organizationId: org.id, spaceId: space.id })
    const query = `query($locale: Locale) { pageCollection(locale: $locale) { items {
      image { id url filename mimeType size width height title description }
      body { assets { id } }
    } } }`
    const ask = async (locale = 'en-US', actor = key, preview = false) => {
      const res = await t.request('/graphql', {
        method: 'POST',
        actor,
        json: {
          query: preview
            ? query.replace('(locale: $locale)', '(locale: $locale, preview: true)')
            : query,
          variables: { locale },
        },
      })
      const json = (await res.json()) as {
        data?: {
          pageCollection: {
            items: { image: Record<string, unknown> | null; body: { assets: { id: string }[] } }[]
          }
        }
        errors?: unknown
      }
      expect(json.errors).toBeUndefined()
      return { cache: res.headers.get('x-blixis-cache'), item: json.data?.pageCollection.items[0] }
    }
    const first = await ask('nl-NL')
    expect(first.item?.image).toEqual({
      id: image.sys.id,
      url: `http://blixis.test${image.fields.url}`, // absolute, from the request origin
      filename: 'hero.png',
      mimeType: 'image/png',
      size: png(40, 20).length,
      width: 40,
      height: 20,
      title: 'Hero image', // nl-NL falls back to en-US
      description: null,
    })
    expect(first.item?.body.assets).toEqual([{ id: image.sys.id }])
    expect((await ask('nl-NL')).cache).toBe('HIT')

    // A published entry uses the asset: unpublishing needs force (ASSET_USAGE from content).
    await expect(
      run((services) => services.get(ASSET_SERVICE).unpublish(owner, tenant, image.sys.id)),
    ).rejects.toThrow('1 published entry links to this asset')
    // Unpublishing the asset reaches cached responses through DELIVERY_INVALIDATION.
    await run((services) =>
      services.get(ASSET_SERVICE).unpublish(owner, tenant, image.sys.id, { force: true }),
    )
    const after = await ask('nl-NL')
    expect(after.cache).toBe('MISS')
    expect(after.item?.image).toBeNull()
    expect(after.item?.body.assets).toEqual([])
    // Preview still shows the draft asset.
    const preview = await ask(
      'en-US',
      asDeliveryKey({ organizationId: org.id, spaceId: space.id }, 'preview'),
      true,
    )
    expect(preview.item?.image).toMatchObject({ id: image.sys.id })
  })
})

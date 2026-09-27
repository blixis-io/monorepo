#!/usr/bin/env node
/**
 * Seeds a space with the example model and content through `@blixis/sdk` (plan 017.004):
 * locales, an `author` and a `post` type, images, three posts (one left as a draft), and a
 * delivery and a preview key. Prints the `.env` lines the site needs.
 *
 *   BLIXIS_API_URL=http://localhost:8787 BLIXIS_TOKEN=blx_pat_… pnpm --filter @blixis/example-site seed
 *
 * Set BLIXIS_SPACE_ID to seed an existing space; otherwise an organization and space are created.
 */
import process from 'node:process'
import { deflateSync } from 'node:zlib'
import { type BlixisClient, createBlixisClient } from '@blixis/sdk'

/** A solid-colour PNG, generated so the example needs no binary files. */
export function png(width: number, height: number, rgb: [number, number, number]): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (bytes: Uint8Array) => {
    let c = 0xffffffff
    for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const u32 = (n: number) =>
    new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255])
  const chunk = (type: string, data: Uint8Array) => {
    const body = new Uint8Array([...new TextEncoder().encode(type), ...data])
    return new Uint8Array([...u32(data.length), ...body, ...u32(crc(body))])
  }
  const row = new Uint8Array(1 + width * 3)
  for (let x = 0; x < width; x++) row.set(rgb, 1 + x * 3)
  const raw = new Uint8Array(row.length * height)
  for (let y = 0; y < height; y++) raw.set(row, y * row.length)
  const header = new Uint8Array([...u32(width), ...u32(height), 8, 2, 0, 0, 0])
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...chunk('IHDR', header),
    ...chunk('IDAT', deflateSync(raw)),
    ...chunk('IEND', new Uint8Array()),
  ])
}

const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** Creates the model and content; returns the space and its keys. */
export async function seed(blixis: BlixisClient, existingSpaceId?: string) {
  let spaceId = existingSpaceId
  if (spaceId === undefined) {
    const suffix = Date.now().toString(36)
    const org = await blixis.organizations.create({ name: 'Example', slug: `example-${suffix}` })
    spaceId = (await blixis.spaces.create(org.id, { name: 'Example site', slug: 'site' })).id
  }
  const space = { params: { spaceId } }
  const locales = await blixis.call('listLocales', space)
  if (!locales.locales.some((l) => l.code === 'nl-NL'))
    await blixis.call('createLocale', { ...space, body: { code: 'nl-NL', fallbackCode: 'en-US' } })

  const author = await blixis.contentTypes.create(spaceId, {
    apiId: 'author',
    name: 'Author',
    displayField: 'name',
    fields: [
      { apiId: 'name', name: 'Name', type: 'text', required: true },
      { apiId: 'avatar', name: 'Avatar', type: 'asset', settings: { mimeTypes: ['image/*'] } },
    ],
  })
  await blixis.contentTypes.create(spaceId, {
    apiId: 'post',
    name: 'Post',
    displayField: 'title',
    fields: [
      { apiId: 'title', name: 'Title', type: 'text', required: true, localized: true },
      { apiId: 'slug', name: 'Slug', type: 'text', required: true, settings: { format: 'slug' } },
      { apiId: 'excerpt', name: 'Excerpt', type: 'longText', localized: true },
      { apiId: 'cover', name: 'Cover', type: 'asset', settings: { mimeTypes: ['image/*'] } },
      {
        apiId: 'author',
        name: 'Author',
        type: 'reference',
        settings: { contentTypeIds: [author.id] },
      },
      { apiId: 'body', name: 'Body', type: 'richText', localized: true },
    ],
  })

  const image = async (
    name: string,
    rgb: [number, number, number],
    width: number,
    height: number,
    title: string,
  ) => {
    const asset = await blixis.assets.upload(
      spaceId,
      new Blob([png(width, height, rgb) as Uint8Array<ArrayBuffer>], { type: 'image/png' }),
      {
        filename: name,
      },
    )
    const titled = await blixis.assets.update(
      asset.sys.id,
      { title: { 'en-US': title } },
      asset.sys.version,
    )
    await blixis.assets.publish(titled.sys.id)
    return titled.sys.id
  }
  const avatar = await image('ada.png', [214, 110, 64], 96, 96, 'Ada')
  const coverA = await image('hello.png', [44, 110, 186], 600, 315, 'Blue cover')
  const coverB = await image('assets.png', [62, 150, 96], 600, 315, 'Green cover')

  const ada = await blixis.entries.create(spaceId, 'author', {
    name: 'Ada',
    avatar: { type: 'asset', id: avatar },
  })
  await blixis.entries.publish(ada.sys.id)

  const make = async (fields: Record<string, unknown>, publish: boolean) => {
    const entry = await blixis.entries.create(spaceId, 'post', {
      author: { type: 'entry', id: ada.sys.id },
      ...fields,
    })
    if (publish) await blixis.entries.publish(entry.sys.id)
    return entry.sys.id
  }
  await make(
    {
      title: { 'en-US': 'Hello, Blixis', 'nl-NL': 'Hallo, Blixis' },
      slug: 'hello-blixis',
      excerpt: {
        'en-US': 'A first post, rendered from the delivery API.',
        'nl-NL': 'Een eerste bericht.',
      },
      cover: { type: 'asset', id: coverA },
      body: {
        'en-US': {
          type: 'doc',
          content: [
            paragraph('This page was built from content in Blixis.'),
            {
              type: 'heading',
              attrs: { level: 2 },
              content: [{ type: 'text', text: 'Rich text' }],
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'With ' },
                { type: 'text', text: 'formatting', marks: [{ type: 'bold' }] },
                { type: 'text', text: ' and ' },
                {
                  type: 'text',
                  text: 'links',
                  marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
                },
                { type: 'text', text: '.' },
              ],
            },
            { type: 'embeddedAsset', attrs: { id: coverB } },
          ],
        },
        'nl-NL': {
          type: 'doc',
          content: [paragraph('Deze pagina is gebouwd met inhoud uit Blixis.')],
        },
      },
    },
    true,
  )
  await make(
    {
      title: { 'en-US': 'Working with assets' },
      slug: 'working-with-assets',
      excerpt: { 'en-US': 'Images come from the asset delivery route.' },
      cover: { type: 'asset', id: coverB },
      body: {
        'en-US': { type: 'doc', content: [paragraph('Covers and inline images are assets.')] },
      },
    },
    true,
  )
  await make(
    {
      title: { 'en-US': 'Coming soon' },
      slug: 'coming-soon',
      body: { 'en-US': { type: 'doc', content: [paragraph('A draft.')] } },
    },
    false,
  )

  const deliveryKey = (
    await blixis.deliveryKeys.create(spaceId, { name: 'Example site', kind: 'delivery' })
  ).key
  const previewKey = (
    await blixis.deliveryKeys.create(spaceId, { name: 'Example preview', kind: 'preview' })
  ).key
  return { spaceId, deliveryKey, previewKey }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const baseUrl = process.env['BLIXIS_API_URL']
  const token = process.env['BLIXIS_TOKEN']
  if (baseUrl === undefined || token === undefined) {
    console.error(
      'Set BLIXIS_API_URL and BLIXIS_TOKEN (an API token of a user who may create organizations)',
    )
    process.exit(2)
  }
  const result = await seed(createBlixisClient({ baseUrl, token }), process.env['BLIXIS_SPACE_ID'])
  console.log(`# apps/example-site/.env — space ${result.spaceId}`)
  console.log(`BLIXIS_API_URL=${baseUrl}`)
  console.log(`BLIXIS_DELIVERY_KEY=${result.deliveryKey}`)
  console.log(`BLIXIS_PREVIEW_KEY=${result.previewKey}`)
}

import { execFile } from 'node:child_process'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { promisify } from 'node:util'
import { assetsModule } from '@blixis-io/assets'
import { AUTH_CONFIG, authModule, generateSigningKey } from '@blixis-io/auth'
import { contentModule } from '@blixis-io/content'
import { OBJECT_STORAGE } from '@blixis-io/contracts'
import { databaseModule } from '@blixis-io/database'
import { idempotencyModule } from '@blixis-io/database/idempotency'
import { eventsModule } from '@blixis-io/events'
import { graphqlModule } from '@blixis-io/graphql'
import { permissionsModule } from '@blixis-io/permissions'
import { createBlixisClient } from '@blixis-io/sdk'
import { spacesModule } from '@blixis-io/spaces'
import {
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
import { usersModule } from '@blixis-io/users'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seed } from '../scripts/seed.ts'

const run = promisify(execFile)
const site = path.resolve(import.meta.dirname, '..')
const outRoot = path.join(site, 'dist-test')

const modules = () => [
  databaseModule(),
  idempotencyModule(),
  usersModule(),
  authModule({ allowSignUp: true }),
  spacesModule(),
  permissionsModule(),
  contentModule({ stampTtlMs: 0 }),
  assetsModule(),
  graphqlModule(),
]

/**
 * Plan 017.004: seeds a real (in-process) API through the SDK, serves it on a local port, and
 * builds the Astro site twice — published and preview — checking the generated HTML.
 */
describe.skipIf(!databaseTestsEnabled())('example site (Astro build against a seeded API)', () => {
  let db: TestDatabase
  let server: Server
  let baseUrl: string
  let keys: { deliveryKey: string; previewKey: string }

  beforeAll(async () => {
    db = await createTestDatabase({ modules: [...modules(), eventsModule()] })
    const events = captureEvents({ mode: 'deferred' })
    const t = await createTestBlixis({
      modules: [...modules(), events.module()],
      database: db,
      overrides: [
        serviceOverride(AUTH_CONFIG, {
          signingKeys: JSON.stringify([await generateSigningKey('site')]),
          allowedOrigins: [],
        }),
        serviceOverride(OBJECT_STORAGE, createMemoryObjectStorage()),
      ],
    })
    // The API over HTTP, as Astro's build process will call it.
    server = createServer(async (req, res) => {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk as Buffer)
      const body = Buffer.concat(chunks)
      const request = new Request(`http://${req.headers.host}${req.url}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        ...(body.length > 0 ? { body } : {}),
      })
      const response = await t.app.fetch(request)
      await events.flush()
      res.writeHead(response.status, Object.fromEntries(response.headers))
      res.end(Buffer.from(await response.arrayBuffer()))
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`

    const session = await createBlixisClient({ baseUrl }).call('signUp', {
      body: {
        email: 'site@example.com',
        displayName: 'Site',
        password: 'correct horse battery',
        tokenDelivery: 'body',
      },
    })
    keys = await seed(createBlixisClient({ baseUrl, token: session.accessToken }))
  }, 60_000)

  afterAll(async () => {
    rmSync(outRoot, { recursive: true, force: true })
    await new Promise((resolve) => server?.close(resolve))
    await db?.drop()
  })

  async function build(name: string, env: Record<string, string>) {
    const outDir = path.join(outRoot, name)
    await run(
      process.execPath,
      [path.join(site, 'node_modules/astro/bin/astro.mjs'), 'build', '--outDir', outDir],
      {
        cwd: site,
        env: { ...process.env, BLIXIS_API_URL: baseUrl, ...env },
        timeout: 120_000,
      },
    )
    return (file: string) => {
      const full = path.join(outDir, file)
      return existsSync(full) ? readFileSync(full, 'utf8') : undefined
    }
  }

  it('builds the published site: posts, locales, rich text, images, no drafts', async () => {
    const page = await build('published', {
      BLIXIS_DELIVERY_KEY: keys.deliveryKey,
      BLIXIS_PREVIEW_KEY: keys.previewKey,
    })
    const index = page('index.html') ?? ''
    expect(index).toContain('Hello, Blixis')
    expect(index).toContain('Working with assets')
    expect(index).not.toContain('Coming soon')
    expect(index).toMatch(new RegExp(`src="${baseUrl}/assets/[^"]+/hello\\.png"`))
    expect(page('nl/index.html')).toContain('Hallo, Blixis')

    const post = page('posts/hello-blixis/index.html') ?? ''
    expect(post).toContain('<h2>Rich text</h2>')
    expect(post).toContain('<strong>formatting</strong>')
    expect(post).toContain('<a href="https://example.com">links</a>')
    expect(post).toMatch(/<figure><img src="[^"]+\/assets\.png"/)
    expect(post).toContain('Ada')
    expect(page('nl/posts/hello-blixis/index.html')).toContain(
      'Deze pagina is gebouwd met inhoud uit Blixis.',
    )
    expect(page('posts/coming-soon/index.html')).toBeUndefined()
    // Keys are build-time only: never in the output.
    expect(index).not.toContain(keys.deliveryKey)
  }, 180_000)

  it('builds the preview site with drafts', async () => {
    const page = await build('preview', {
      BLIXIS_PREVIEW: '1',
      BLIXIS_DELIVERY_KEY: keys.deliveryKey,
      BLIXIS_PREVIEW_KEY: keys.previewKey,
    })
    const index = page('index.html') ?? ''
    expect(index).toContain('Coming soon')
    expect(index).toContain('Preview: this site shows drafts.')
    expect(page('posts/coming-soon/index.html')).toContain('A draft.')
    expect(index).not.toContain(keys.previewKey)
  }, 180_000)
})

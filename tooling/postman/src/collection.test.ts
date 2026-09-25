import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { BlixisModule } from '@blixis/contracts'
import { createBlixis, noopLogger } from '@blixis/kernel'
import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '..')
const read = (file: string) =>
  JSON.parse(readFileSync(path.join(root, file), 'utf8')) as Record<string, unknown>

interface Item {
  name: string
  item?: Item[]
  request?: { method: string; url: { raw: string } }
}
const requests = (items: Item[]): { name: string; method: string; path: string }[] =>
  items.flatMap((item) =>
    item.item !== undefined
      ? requests(item.item)
      : item.request === undefined
        ? []
        : [
            {
              name: item.name,
              method: item.request.method,
              path: item.request.url.raw.replace('{{baseUrl}}', '').split('?')[0] ?? '',
            },
          ],
  )

/**
 * Routes of the real API Worker: loads its explicit module list (apps/api/src/blixis.config.ts),
 * so the collection is compared with exactly what the API serves — no duplicated module list.
 */
const apiRoutes = async () => {
  const configPath = path.resolve(root, '../../apps/api/src/blixis.config.ts')
  const { modules } = (await import(pathToFileURL(configPath).href)) as {
    modules: readonly BlixisModule[]
  }
  // `ALL` routes are either middleware (`/*`, skipped) or endpoints taking any method, such as
  // `/graphql`: a request with any method matches them.
  return createBlixis({ modules, logger: noopLogger })
    .hono.routes.filter((route) => !(route.method === 'ALL' && route.path.endsWith('*')))
    .map((route) => ({ method: route.method, path: route.path }))
}
const matches = (pattern: string, concrete: string) =>
  new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`).test(concrete)

describe('Postman collection', () => {
  const collection = read('blixis.postman_collection.json') as { item: Item[] }
  const inCollection = requests(collection.item)

  it('only contains requests for routes the API registers', async () => {
    const routes = await apiRoutes()
    const unknown = inCollection.filter(
      (r) =>
        !routes.some(
          (route) =>
            (route.method === r.method || route.method === 'ALL') && matches(route.path, r.path),
        ),
    )
    expect(unknown).toEqual([])
  })

  it('covers every API route (add new endpoints to the collection)', async () => {
    const missing = (await apiRoutes()).filter(
      (route) =>
        !inCollection.some(
          (r) =>
            (route.method === r.method || route.method === 'ALL') && matches(route.path, r.path),
        ),
    )
    expect(missing).toEqual([])
  })

  it('environments share the same variables and commit no secrets', () => {
    const envs = ['local', 'staging', 'production'].map(
      (name) =>
        read(`${name}.postman_environment.json`) as {
          values: { key: string; value: string; type: string }[]
        },
    )
    const keys = envs.map((e) => e.values.map((v) => v.key).sort())
    expect(new Set(keys.map((k) => k.join()))).toHaveLength(1)
    for (const env of envs) {
      for (const v of env.values) {
        if (v.key !== 'baseUrl') expect({ [v.key]: v.value }).toEqual({ [v.key]: '' })
      }
      expect(
        env.values
          .filter((v) => v.type === 'secret')
          .map((v) => v.key)
          .sort(),
      ).toEqual(['accessToken', 'apiToken', 'password', 'refreshToken'])
    }
  })
})

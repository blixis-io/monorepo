import { readFileSync } from 'node:fs'
import path from 'node:path'
import { authModule } from '@blixis/auth'
import { databaseModule } from '@blixis/database'
import { idempotencyModule } from '@blixis/database/idempotency'
import { eventsModule } from '@blixis/events'
import { outboxModule } from '@blixis/events/outbox'
import { createBlixis, noopLogger } from '@blixis/kernel'
import { usersModule } from '@blixis/users'
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
              path: item.request.url.raw.replace('{{baseUrl}}', ''),
            },
          ],
  )

/** The API Worker's modules (apps/api/src/blixis.config.ts), minus app-local config modules. */
const apiRoutes = () => {
  const app = createBlixis({
    modules: [
      databaseModule(),
      eventsModule(),
      outboxModule(),
      idempotencyModule(),
      usersModule(),
      authModule(),
    ],
    logger: noopLogger,
  })
  return app.hono.routes
    .filter((route) => route.method !== 'ALL')
    .map((route) => ({ method: route.method, path: route.path }))
}
const matches = (pattern: string, concrete: string) =>
  new RegExp(`^${pattern.replace(/:[^/]+/g, '[^/]+')}$`).test(concrete)

describe('Postman collection', () => {
  const collection = read('blixis.postman_collection.json') as { item: Item[] }
  const inCollection = requests(collection.item)

  it('only contains requests for routes the API registers', () => {
    const routes = apiRoutes()
    const unknown = inCollection.filter(
      (r) => !routes.some((route) => route.method === r.method && matches(route.path, r.path)),
    )
    expect(unknown).toEqual([])
  })

  it('covers every API route (add new endpoints to the collection)', () => {
    const missing = apiRoutes().filter(
      (route) =>
        !inCollection.some((r) => r.method === route.method && matches(route.path, r.path)),
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

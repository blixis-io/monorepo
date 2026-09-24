import { defineEvent, defineMigration, definePermission, subscribe } from '@blixis/contracts'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { collectContributions, KERNEL_CONTRIBUTIONS } from './contributions.ts'
import { createBlixis } from './create-blixis.ts'
import { defineModule } from './define-module.ts'
import { ModuleValidationError } from './errors.ts'
import { noopLogger } from './logger.ts'

z.config({ jitless: true })

const published = defineEvent({
  type: 'entry.published',
  version: 1,
  delivery: 'best-effort',
  schema: z.object({ id: z.string() }),
})
const handler = async () => {}

const content = defineModule({
  meta: { name: '@blixis/content', version: '1.0.0' },
  permissions: [
    definePermission({ id: 'content.read', description: 'Read' }),
    definePermission({ id: 'content.entries.publish', description: 'Publish' }),
  ],
  events: [subscribe(published, 'reindex', handler)],
  graphql: { typeDefs: 'type Entry { id: ID! }' },
  migrations: [
    defineMigration({ id: '0001_create_entries', up: 'select 1' }),
    defineMigration({ id: '0002_more', up: 'select 1' }),
  ],
})
const seo = defineModule({
  meta: { name: '@acme/seo', version: '1.0.0', requires: { '@blixis/content': '*' } },
  permissions: [definePermission({ id: 'seo.read', description: 'Read SEO' })],
  events: [subscribe(published, 'refresh-seo', handler)],
  migrations: [defineMigration({ id: '0001_create_seo', up: 'select 1' })],
})

describe('collectContributions', () => {
  it('collects attributed contributions in bootstrap order', () => {
    const { contributions, problems } = collectContributions([content(), seo()])
    expect(problems).toEqual([])
    expect(contributions.permissions.map((p) => `${p.module}:${p.value.id}`)).toEqual([
      '@blixis/content:content.read',
      '@blixis/content:content.entries.publish',
      '@acme/seo:seo.read',
    ])
    expect(contributions.subscriptions.map((s) => `${s.module}:${s.value.id}`)).toEqual([
      '@blixis/content:reindex',
      '@acme/seo:refresh-seo',
    ])
    expect(contributions.graphql).toHaveLength(1)
    expect(contributions.migrations.map((m) => `${m.module}:${m.value.id}`)).toEqual([
      '@blixis/content:0001_create_entries',
      '@blixis/content:0002_more',
      '@acme/seo:0001_create_seo',
    ])
    expect(Object.isFrozen(contributions.permissions)).toBe(true)
  })

  it('reports permission, namespace, subscription, and migration conflicts', () => {
    const bad = defineModule({
      meta: { name: '@acme/bad', version: '1.0.0' },
      permissions: [
        definePermission({ id: 'seo.write', description: 'x' }),
        { id: 'nope' as never, description: 'x' },
        definePermission({ id: 'bad.a', description: 'x' }),
        definePermission({ id: 'bad.a', description: 'x' }),
      ],
      events: [subscribe(published, 'dup', handler), subscribe(published, 'dup', handler)],
      migrations: [
        { id: '1_x', up: 'select 1' },
        defineMigration({ id: '0001_a', up: 'x' }),
        defineMigration({ id: '0001_a', up: 'x' }),
      ],
    })
    const { problems } = collectContributions([seo(), bad()])
    expect(problems.map((p) => p.message)).toEqual([
      'permission namespace "seo" is owned by @acme/seo (seo.write)',
      'declares an invalid permission id "nope"',
      'declares permission bad.a twice',
      'declares event subscription id "dup" twice',
      'has an invalid migration id "1_x" (expected NNNN_snake_case)',
      'declares migration 0001_a twice',
    ])
    expect(new Set(problems.map((p) => p.module))).toEqual(new Set(['@acme/bad']))
  })

  it('reports duplicate permission ids across modules, naming both', () => {
    const other = defineModule({
      meta: { name: '@acme/other', version: '1.0.0' },
      permissions: [definePermission({ id: 'seo.read', description: 'x' })],
    })
    expect(collectContributions([seo(), other()]).problems).toEqual([
      {
        module: '@acme/other',
        message: 'declares permission seo.read, already declared by @acme/seo',
      },
    ])
  })
})

describe('createBlixis contributions', () => {
  it('fails startup on conflicts and exposes contributions via app and token', async () => {
    expect(() =>
      createBlixis({
        modules: [
          defineModule({
            meta: { name: 'x', version: '1.0.0' },
            migrations: [{ id: 'bad', up: '' }],
          })(),
        ],
        logger: noopLogger,
      }),
    ).toThrowError(ModuleValidationError)

    let fromBoot: number | undefined
    const reader = defineModule({
      meta: { name: 'reader', version: '1.0.0' },
      boot(ctx) {
        fromBoot = ctx.services.get(KERNEL_CONTRIBUTIONS).permissions.length
      },
    })
    const app = createBlixis({ modules: [content(), seo(), reader()], logger: noopLogger })
    expect(app.contributions.permissions).toHaveLength(3)
    await app.ready()
    expect(fromBoot).toBe(3)
  })
})

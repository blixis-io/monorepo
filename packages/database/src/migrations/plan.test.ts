import { defineMigration } from '@blixis/contracts'
import { describe, expect, it } from 'vitest'
import {
  FUNCTION_CHECKSUM,
  type ModuleMigration,
  migrationChecksum,
  planMigrations,
} from './plan.ts'

const m = (module: string, id: string, up: string | (() => Promise<void>) = `-- ${id}`) =>
  ({ module, value: defineMigration({ id, up }) }) satisfies ModuleMigration
const applied = async (entry: ModuleMigration, checksum?: string) => ({
  module: entry.module,
  id: entry.value.id,
  checksum: checksum ?? (await migrationChecksum(entry.value)),
  appliedAt: new Date(0),
})

describe('planMigrations', () => {
  it('orders modules as contributed (bootstrap order) and each module by id', async () => {
    const plan = await planMigrations(
      [m('@acme/b', '0002_second'), m('@acme/b', '0001_first'), m('@acme/a', '0001_first')],
      [],
    )
    expect(plan.pending.map((p) => `${p.module}:${p.id}`)).toEqual([
      '@acme/b:0001_first',
      '@acme/b:0002_second',
      '@acme/a:0001_first',
    ])
    expect(plan.problems).toEqual([])
  })

  it('skips applied migrations and reports removed ones as unknown', async () => {
    const one = m('@acme/a', '0001_first')
    const gone = m('@acme/old', '0001_first')
    const plan = await planMigrations(
      [one, m('@acme/a', '0002_next')],
      [await applied(one), await applied(gone)],
    )
    expect(plan.pending.map((p) => p.id)).toEqual(['0002_next'])
    expect(plan.unknown.map((u) => u.module)).toEqual(['@acme/old'])
  })

  it('blocks when an applied SQL migration changed', async () => {
    const original = m('@acme/a', '0001_first', 'create table a ()')
    const edited = m('@acme/a', '0001_first', 'create table a (id int)')
    const plan = await planMigrations([edited], [await applied(original)])
    expect(plan.problems).toEqual([
      expect.stringMatching(/0001_first was changed after it was applied/),
    ])
  })

  it('does not verify function migrations (source differs between builds)', async () => {
    const fn = m('@acme/a', '0001_first', async () => undefined)
    expect(await migrationChecksum(fn.value)).toBe(FUNCTION_CHECKSUM)
    const plan = await planMigrations([fn], [await applied(fn, FUNCTION_CHECKSUM)])
    expect(plan.problems).toEqual([])
  })

  it('blocks migrations inserted before an already applied one', async () => {
    const later = m('@acme/a', '0005_later')
    const plan = await planMigrations(
      [m('@acme/a', '0003_inserted'), later],
      [await applied(later)],
    )
    expect(plan.problems).toEqual([
      expect.stringMatching(/0003_inserted sorts before the already applied 0005_later/),
    ])
    expect(plan.pending).toEqual([])
  })

  it('computes stable SHA-256 checksums of SQL text', async () => {
    expect(await migrationChecksum(defineMigration({ id: '0001_x', up: 'select 1' }))).toBe(
      '822ae07d4783158bc1912bb623e5107cc9002d519e1143a9c200ed6ee18b6d0f',
    )
  })
})

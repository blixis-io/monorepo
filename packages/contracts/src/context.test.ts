import { describe, expect, it } from 'vitest'
import { defineMigration } from './migrations.ts'

describe('defineMigration', () => {
  it('accepts NNNN_snake_case ids and freezes', () => {
    const m = defineMigration({ id: '0001_create_entries', up: 'create table entries ()' })
    expect(m.id).toBe('0001_create_entries')
    expect(Object.isFrozen(m)).toBe(true)
  })

  it('rejects invalid ids', () => {
    for (const id of ['1_create', 'create_entries', '0001-create', '0001_Create', '0001_'])
      expect(() => defineMigration({ id, up: 'select 1' })).toThrowError(TypeError)
  })

  it('supports function steps and non-transactional migrations', async () => {
    const executed: string[] = []
    const m = defineMigration({
      id: '0002_index_entries',
      transactional: false,
      up: async (db) => db.execute('create index concurrently x on entries (id)'),
    })
    if (typeof m.up === 'function') {
      await m.up({ execute: async (sql) => void executed.push(sql) })
    }
    expect(executed).toEqual(['create index concurrently x on entries (id)'])
    expect(m.transactional).toBe(false)
  })
})

import { defineMigration } from '@blixis/contracts'
import { Client } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { ModuleMigration } from './plan.ts'
import { migrationStatus, runMigrations } from './run.ts'

// Integration tests against real Postgres. Enabled when BLIXIS_TEST_DATABASE_URL is set
// (locally: docker compose; in CI from task 005.006). Uses its own database per run.
const baseUrl = process.env['BLIXIS_TEST_DATABASE_URL']

describe.skipIf(baseUrl === undefined)('runMigrations (Postgres)', () => {
  const database = `blixis_migrations_test_${Date.now()}`
  let url = ''

  const admin = async (sql: string) => {
    const client = new Client({ connectionString: baseUrl })
    await client.connect()
    try {
      await client.query(sql)
    } finally {
      await client.end()
    }
  }
  const query = async <T>(sql: string): Promise<T[]> => {
    const client = new Client({ connectionString: url })
    await client.connect()
    try {
      return (await client.query(sql)).rows as T[]
    } finally {
      await client.end()
    }
  }

  beforeAll(async () => {
    await admin(`create database ${database}`)
    const parsed = new URL(baseUrl ?? '')
    parsed.pathname = `/${database}`
    url = parsed.toString()
  })
  afterAll(async () => {
    await admin(`drop database if exists ${database} with (force)`)
  })

  const content: ModuleMigration[] = [
    {
      module: '@acme/content',
      value: defineMigration({
        id: '0001_create_entries',
        up: 'create schema content; create table content.entries (id int primary key, space_id int not null)',
      }),
    },
  ]
  const spaces: ModuleMigration[] = [
    {
      module: '@acme/spaces',
      value: defineMigration({
        id: '0001_create_spaces',
        up: 'create schema spaces; create table spaces.spaces (id int primary key)',
      }),
    },
  ]

  it('applies migrations in module order and records them', async () => {
    const logs: string[] = []
    const result = await runMigrations({
      connectionString: url,
      migrations: [...spaces, ...content],
      log: (l) => logs.push(l),
    })
    expect(result.applied.map((a) => `${a.module}:${a.id}`)).toEqual([
      '@acme/spaces:0001_create_spaces',
      '@acme/content:0001_create_entries',
    ])
    expect(logs[0]).toMatch(/^applied @acme\/spaces 0001_create_spaces/)
    const rows = await query<{ module: string }>(
      'select module from blixis.migrations order by applied_at, module',
    )
    expect(rows.map((r) => r.module)).toEqual(['@acme/spaces', '@acme/content'])
  })

  it('is idempotent on re-run', async () => {
    const result = await runMigrations({
      connectionString: url,
      migrations: [...spaces, ...content],
    })
    expect(result.applied).toEqual([])
  })

  it('rolls back a failing transactional migration including its tracking row', async () => {
    const broken: ModuleMigration = {
      module: '@acme/content',
      value: defineMigration({
        id: '0002_broken',
        up: 'create table content.half (id int); select * from missing_table',
      }),
    }
    await expect(
      runMigrations({ connectionString: url, migrations: [...content, broken] }),
    ).rejects.toThrow()
    expect(await query('select 1 from blixis.migrations where id = $$0002_broken$$')).toEqual([])
    expect(await query(`select to_regclass('content.half') as t`)).toEqual([{ t: null }])
  })

  it('refuses to run when an applied migration changed', async () => {
    const edited: ModuleMigration = {
      module: '@acme/content',
      value: defineMigration({ id: '0001_create_entries', up: 'create schema content' }),
    }
    await expect(runMigrations({ connectionString: url, migrations: [edited] })).rejects.toThrow(
      /Migrations blocked/,
    )
    const status = await migrationStatus({ connectionString: url, migrations: [edited] })
    expect(status.problems).toHaveLength(1)
  })

  it('supports non-transactional and function migrations', async () => {
    const extra: ModuleMigration[] = [
      {
        module: '@acme/content',
        value: defineMigration({
          id: '0002_index_space',
          transactional: false,
          up: 'create index concurrently entries_space_idx on content.entries (space_id)',
        }),
      },
      {
        module: '@acme/content',
        value: defineMigration({
          id: '0003_seed',
          up: async (db) => db.execute('insert into content.entries values ($1, $2)', [1, 7]),
        }),
      },
    ]
    const result = await runMigrations({
      connectionString: url,
      migrations: [...content, ...extra],
    })
    expect(result.applied.map((a) => a.id)).toEqual(['0002_index_space', '0003_seed'])
    expect(await query('select space_id from content.entries')).toEqual([{ space_id: 7 }])
  })

  it('fails fast while another run holds the lock', async () => {
    const holder = new Client({ connectionString: url })
    await holder.connect()
    try {
      await holder.query('select pg_advisory_lock($1)', [0x626c786d])
      await expect(runMigrations({ connectionString: url, migrations: content })).rejects.toThrow(
        /Another migration run holds the lock/,
      )
    } finally {
      await holder.end()
    }
  })
})

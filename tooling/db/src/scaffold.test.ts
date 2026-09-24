import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { nextMigrationNumber, scaffoldMigration } from './scaffold.ts'

function moduleDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'blixis-db-'))
  writeFileSync(path.join(dir, 'package.json'), '{}')
  return dir
}

describe('scaffoldMigration', () => {
  it('creates numbered migration files that define a valid migration', () => {
    const dir = moduleDir()
    const first = scaffoldMigration(dir, 'create_entries')
    const second = scaffoldMigration(dir, 'add_slug')
    expect([first.id, second.id]).toEqual(['0001_create_entries', '0002_add_slug'])
    expect(readFileSync(second.file, 'utf8')).toContain("id: '0002_add_slug'")
    expect(nextMigrationNumber(path.join(dir, 'src', 'migrations'))).toBe('0003')
  })

  it('rejects bad names and non-package directories', () => {
    expect(() => scaffoldMigration(moduleDir(), 'Add-Slug')).toThrowError(/snake_case/)
    expect(() => scaffoldMigration(tmpdir(), 'x')).toThrowError(/not a package directory/)
  })
})

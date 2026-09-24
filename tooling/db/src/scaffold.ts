import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const NAME = /^[a-z0-9]+(?:_[a-z0-9]+)*$/
const FILE = /^(\d{4})_[a-z0-9_]+\.ts$/

/** Next free `NNNN` prefix among the migration files in `dir`. */
export function nextMigrationNumber(dir: string): string {
  const numbers = existsSync(dir)
    ? readdirSync(dir).flatMap((file) => {
        const match = FILE.exec(file)
        return match?.[1] === undefined ? [] : [Number(match[1])]
      })
    : []
  return String(Math.max(0, ...numbers) + 1).padStart(4, '0')
}

/** Creates `<moduleDir>/src/migrations/NNNN_<name>.ts` and returns its path and id. */
export function scaffoldMigration(moduleDir: string, name: string): { file: string; id: string } {
  if (!NAME.test(name)) throw new Error(`Invalid migration name "${name}": use snake_case`)
  if (!existsSync(path.join(moduleDir, 'package.json'))) {
    throw new Error(`${moduleDir} is not a package directory (no package.json)`)
  }
  const dir = path.join(moduleDir, 'src', 'migrations')
  const id = `${nextMigrationNumber(dir)}_${name}`
  const file = path.join(dir, `${id}.ts`)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    file,
    `import { defineMigration } from '@blixis/contracts'

/**
 * ${name.replaceAll('_', ' ')}. Paste reviewed SQL (e.g. proposed by \`drizzle-kit generate\`).
 * Never edit this file after it has been applied anywhere — add a new migration instead.
 */
export const migration = defineMigration({
  id: '${id}',
  up: /* sql */ \`
-- SQL
\`,
})
`,
    { flag: 'wx' },
  )
  return { file, id }
}

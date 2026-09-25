#!/usr/bin/env node
import path from 'node:path'
import process from 'node:process'
import { migrationStatus, runMigrations } from '@blixis/database/migrations'
import { createUser, generateSigningKeyJson } from './auth.ts'
import { loadMigrations } from './load.ts'
import { scaffoldMigration } from './scaffold.ts'

const USAGE = `Usage:
  blixis-db migrate [--config <file>]   apply pending migrations (DATABASE_URL, migration role)
  blixis-db status  [--config <file>]   show applied, pending, and blocking migrations
  blixis-db new <module-dir> <name>     scaffold <module-dir>/src/migrations/NNNN_<name>.ts
  blixis-db create-user --email <e> --name <n>   create a user; password from AUTH_PASSWORD (DATABASE_URL)
  blixis-db generate-signing-key [kid]           print a new AUTH_SIGNING_KEYS value

--config defaults to apps/api/src/blixis.config.ts (the API Worker's module list).`

const root = path.resolve(import.meta.dirname, '../../..')
// pnpm runs scripts from the package directory; resolve user paths against where it was invoked.
const cwd = process.env['INIT_CWD'] ?? process.cwd()

function option(args: string[], name: string): string | undefined {
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

function databaseUrl(): string {
  const url = process.env['DATABASE_URL']
  if (url === undefined || url === '') {
    throw new Error('DATABASE_URL is not set (direct Postgres URL of the migration role)')
  }
  return url
}

/** Error text for the terminal: the sanitized cause carries the driver message and SQLSTATE. */
function describe(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause as (Error & { code?: string }) | undefined
  const detail =
    cause?.message === undefined
      ? ''
      : `\n  cause: ${cause.message}${cause.code ? ` (${cause.code})` : ''}`
  return `${error.message}${detail}`
}

async function main(args: string[]): Promise<number> {
  const [command, ...rest] = args
  const config = path.resolve(
    cwd,
    option(rest, '--config') ?? path.join(root, 'apps/api/src/blixis.config.ts'),
  )

  switch (command) {
    case 'migrate': {
      const migrations = await loadMigrations(config)
      const { applied, plan } = await runMigrations({
        connectionString: databaseUrl(),
        migrations,
        log: (line) => console.log(line),
      })
      for (const row of plan.unknown)
        console.warn(`warning: ${row.module} ${row.id} is applied but no longer declared`)
      console.log(
        applied.length === 0 ? 'db: up to date' : `db: applied ${applied.length} migration(s)`,
      )
      return 0
    }
    case 'status': {
      const plan = await migrationStatus({
        connectionString: databaseUrl(),
        migrations: await loadMigrations(config),
      })
      for (const row of plan.applied)
        console.log(`applied  ${row.module} ${row.id}  ${row.appliedAt.toISOString()}`)
      for (const row of plan.pending) console.log(`pending  ${row.module} ${row.id}`)
      for (const row of plan.unknown) console.log(`unknown  ${row.module} ${row.id}`)
      for (const problem of plan.problems) console.error(`blocked  ${problem}`)
      return plan.problems.length > 0 ? 1 : 0
    }
    case 'create-user': {
      const email = option(rest, '--email')
      const displayName = option(rest, '--name')
      const password = process.env['AUTH_PASSWORD']
      if (email === undefined || displayName === undefined) break
      if (password === undefined || password === '') {
        throw new Error(
          'Set AUTH_PASSWORD (e.g. read -rs "AUTH_PASSWORD?Password: "; export AUTH_PASSWORD)',
        )
      }
      const user = await createUser({
        configPath: config,
        databaseUrl: databaseUrl(),
        email,
        displayName,
        password,
      })
      console.log(`created user ${user.email} (${user.id})`)
      return 0
    }
    case 'generate-signing-key': {
      const kid = rest[0] ?? `key-${new Date().toISOString().slice(0, 10)}`
      console.log(await generateSigningKeyJson(kid))
      return 0
    }
    case 'new': {
      const [moduleDir, name] = rest
      if (moduleDir === undefined || name === undefined) break
      const { file, id } = scaffoldMigration(path.resolve(cwd, moduleDir), name)
      console.log(
        `created ${path.relative(cwd, file)}\nregister it in the module: migrations: [..., migration] (${id})`,
      )
      return 0
    }
  }
  console.error(USAGE)
  return 2
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code
  },
  (error: unknown) => {
    console.error(`db: ${describe(error)}`)
    process.exitCode = 1
  },
)

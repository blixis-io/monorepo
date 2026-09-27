import { execFileSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))

/**
 * Creates a fresh user for this run with the repository's CLI (sign-up is off by default). The
 * credentials are random and exist only in the local database; tests read them from the env.
 */
export default function globalSetup(): void {
  const email = `e2e-${Date.now()}@example.test`
  const password = randomBytes(18).toString('base64url')
  execFileSync(
    process.execPath,
    ['tooling/db/src/cli.ts', 'create-user', '--email', email, '--name', 'E2E Editor'],
    {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL:
          process.env['DATABASE_URL'] ?? 'postgres://blixis:blixis@localhost:5432/blixis',
        AUTH_PASSWORD: password,
      },
    },
  )
  process.env['E2E_EMAIL'] = email
  process.env['E2E_PASSWORD'] = password
}

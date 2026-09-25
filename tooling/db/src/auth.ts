import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { AUTH_SERVICE, generateSigningKey } from '@blixis/auth'
import type { BlixisModule } from '@blixis/contracts'
import { createDatabase, DATABASE } from '@blixis/database'
import { QUEUE_SENDER } from '@blixis/events'
import { createBlixis, noopLogger, serviceOverride } from '@blixis/kernel'

/** `generate-signing-key [kid]`: a new Ed25519 key as the JSON array `AUTH_SIGNING_KEYS` expects. */
export async function generateSigningKeyJson(kid: string): Promise<string> {
  return JSON.stringify([await generateSigningKey(kid)])
}

/**
 * `create-user`: creates a user with a password through the app's own modules (validation,
 * scrypt, `user.created` via the outbox). Events are left pending in the outbox; the deployed
 * Worker's sweep sends them within a minute.
 */
export async function createUser(options: {
  readonly configPath: string
  readonly databaseUrl: string
  readonly email: string
  readonly displayName: string
  readonly password: string
}): Promise<{ id: string; email: string }> {
  const config = (await import(pathToFileURL(path.resolve(options.configPath)).href)) as {
    modules: readonly BlixisModule[]
  }
  const db = createDatabase({ connectionString: options.databaseUrl })
  try {
    const app = createBlixis({
      modules: config.modules,
      logger: noopLogger,
      overrides: [
        serviceOverride(DATABASE, db),
        // No queue from the CLI: post-commit dispatch fails and the outbox sweep sends later.
        serviceOverride(QUEUE_SENDER, {
          send: () => Promise.reject(new Error('CLI has no queue; the outbox sweep delivers')),
        }),
      ],
    })
    const user = await app.runInScope(
      { actor: { type: 'system', component: '@blixis/db-tooling' } },
      async ({ services }) =>
        services.get(AUTH_SERVICE).createAccount({
          email: options.email,
          displayName: options.displayName,
          password: options.password,
        }),
    )
    return { id: user.id, email: user.email }
  } finally {
    await db.close()
  }
}

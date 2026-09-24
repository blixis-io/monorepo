import {
  type InferOutput,
  InfrastructureError,
  type StandardSchemaV1,
  ValidationError,
  validateSync,
} from '@blixis/contracts'

/** Deployment environment of a Blixis Worker (docs/operations/environments.md). */
export type BlixisEnvironment = 'local' | 'preview' | 'staging' | 'production'

/**
 * Variables every Blixis Worker has. Worker apps extend this with their bindings, added by
 * the plan that introduces each resource (Hyperdrive in 005, Queues in 006, KV in 013, R2 in
 * 014, Workflows in 016) — always declared per wrangler environment.
 */
export interface CloudflareEnvBase {
  readonly BLIXIS_ENV: BlixisEnvironment
  readonly LOG_LEVEL?: 'debug' | 'info' | 'warn' | 'error'
}

/** Declares an environment schema (identity helper for readability and inference). */
export function defineEnvSchema<S extends StandardSchemaV1>(schema: S): S {
  return schema
}

/**
 * Validates Worker environment variables and secrets. Errors name the offending keys and
 * problems but **never include values** (secrets, connection strings).
 *
 * @throws {InfrastructureError} when the environment is invalid (maps to a 500 response; the
 * message is logged, never shown to clients).
 */
export function parseEnv<S extends StandardSchemaV1>(env: unknown, schema: S): InferOutput<S> {
  try {
    return validateSync(schema, env)
  } catch (error) {
    if (error instanceof ValidationError) {
      const problems = error.issues.map((issue) => {
        const key = issue.path.length === 0 ? '(env)' : issue.path.join('.')
        return `${key}: ${issue.message}`
      })
      throw new InfrastructureError(`Invalid Worker environment: ${problems.join('; ')}`, {
        details: { keys: error.issues.map((issue) => issue.path.join('.')) },
      })
    }
    throw error
  }
}

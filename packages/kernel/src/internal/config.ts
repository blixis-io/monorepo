import { type BlixisModule, isBlixisError, ValidationError, validate } from '@blixis/contracts'
import { type ModuleProblem, ModuleValidationError } from '../errors.ts'

/**
 * Validates every module's `config` against its `configSchema` (architecture §26, §29) and
 * returns the validated outputs by module name. Modules without a schema get their raw
 * `config`. All failures are reported together; config **values** are never included in
 * messages (they may contain secrets) — only issue paths and messages.
 */
export async function validateModuleConfigs(
  modules: readonly BlixisModule[],
): Promise<ReadonlyMap<string, unknown>> {
  const results = new Map<string, unknown>()
  const problems: ModuleProblem[] = []
  for (const module of modules) {
    if (module.configSchema === undefined) {
      results.set(module.meta.name, module.config)
      continue
    }
    try {
      results.set(module.meta.name, await validate(module.configSchema, module.config ?? {}))
    } catch (error) {
      if (
        error instanceof ValidationError ||
        (isBlixisError(error) && error.code === 'VALIDATION_FAILED')
      ) {
        for (const issue of (error as ValidationError).issues) {
          const path = issue.path.length === 0 ? 'config' : `config.${issue.path.join('.')}`
          problems.push({
            module: module.meta.name,
            message: `invalid configuration at ${path}: ${issue.message}`,
          })
        }
      } else {
        problems.push({
          module: module.meta.name,
          message: 'configuration schema threw while validating',
        })
      }
    }
  }
  if (problems.length > 0) throw new ModuleValidationError(problems)
  return results
}

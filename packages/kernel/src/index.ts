/**
 * `@blixis/kernel` — composes explicitly registered modules into a Blixis application.
 *
 * @packageDocumentation
 */

export {
  type Attributed,
  collectContributions,
  KERNEL_CONTRIBUTIONS,
  type KernelContributions,
} from './contributions.ts'
export {
  type BlixisApp,
  type CreateBlixisOptions,
  createBlixis,
  type ExecutionContextLike,
} from './create-blixis.ts'
export { defineModule } from './define-module.ts'
export { type ModuleProblem, ModuleValidationError } from './errors.ts'
export type { BlixisHonoEnv } from './hono-env.ts'
export { httpStatusFor, type ProblemDetails, toProblemResponse } from './internal/errors-http.ts'
export { type ActorResolver, API_PREFIX, HEALTH_PATH } from './internal/rest.ts'
export { createJsonLogger, type JsonLoggerOptions, type LogLevel, noopLogger } from './logger.ts'

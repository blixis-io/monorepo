/**
 * `@blixis/kernel` — composes explicitly registered modules into a Blixis application.
 *
 * @packageDocumentation
 */
export {
  type BlixisApp,
  type CreateBlixisOptions,
  createBlixis,
  type ExecutionContextLike,
} from './create-blixis.ts'
export { defineModule } from './define-module.ts'
export { type ModuleProblem, ModuleValidationError } from './errors.ts'
export { createJsonLogger, type JsonLoggerOptions, type LogLevel, noopLogger } from './logger.ts'

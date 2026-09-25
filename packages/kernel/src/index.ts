/**
 * `@blixis/kernel` — composes explicitly registered modules into a Blixis application.
 *
 * @packageDocumentation
 */

export { ACTOR_RESOLVERS, type ActorResolverEntry, type ActorResolvers } from './actors.ts'
export {
  BACKGROUND_HANDLERS,
  type BackgroundContext,
  type BackgroundHandlers,
  type QueueBatchLike,
  type QueueHandler,
  type QueueMessageLike,
  RUN_IN_SCOPE,
  type RunInScope,
  type ScheduledEventLike,
  type ScheduledHandler,
  type ScopeSeed,
} from './background.ts'
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
  type ServiceOverride,
  serviceOverride,
} from './create-blixis.ts'
export { defineModule } from './define-module.ts'
export { ERROR_REPORTER, type ErrorReportContext, type ErrorReporter } from './error-reporter.ts'
export { type ModuleProblem, ModuleValidationError } from './errors.ts'
export {
  HEALTH_CHECKS,
  type HealthCheck,
  type HealthCheckResult,
  type HealthChecks,
  type ReadinessReport,
} from './health.ts'
export type { BlixisHonoEnv } from './hono-env.ts'
export { httpStatusFor, type ProblemDetails, toProblemResponse } from './internal/errors-http.ts'
export { type ActorResolver, API_PREFIX, HEALTH_PATH, READY_PATH } from './internal/rest.ts'
export { createJsonLogger, type JsonLoggerOptions, type LogLevel, noopLogger } from './logger.ts'

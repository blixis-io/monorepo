import type {
  AnyServiceToken,
  BlixisModule,
  Logger,
  ModuleMeta,
  ServiceRegistry,
  ServiceToken,
} from '@blixis/contracts'
import { ModuleError, type RequestContext } from '@blixis/contracts'
import { Hono } from 'hono'
import { ACTOR_RESOLVERS, ActorResolverRegistry } from './actors.ts'
import {
  BACKGROUND_HANDLERS,
  BackgroundRegistry,
  type QueueBatchLike,
  RUN_IN_SCOPE,
  type RunInScope,
  type ScheduledEventLike,
} from './background.ts'
import {
  collectContributions,
  KERNEL_CONTRIBUTIONS,
  type KernelContributions,
} from './contributions.ts'
import { ERROR_REPORTER, type ErrorReporter } from './error-reporter.ts'
import { ModuleValidationError } from './errors.ts'
import { HEALTH_CHECKS, HealthRegistry } from './health.ts'
import type { BlixisHonoEnv } from './hono-env.ts'
import { validateModuleConfigs } from './internal/config.ts'
import { validateModuleGraph } from './internal/graph.ts'
import { type ActorResolver, installRest } from './internal/rest.ts'
import { ServiceContainer } from './internal/services.ts'
import { provideRequestContext } from './internal/tenant-binder.ts'
import { createJsonLogger } from './logger.ts'

/** Minimal execution context accepted by {@link BlixisApp.fetch} (compatible with Workers). */
export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void
}

/** Options for {@link createBlixis}. */
export interface CreateBlixisOptions {
  /** Modules in registration order, e.g. `[auth(), content(), seo()]` (explicit, §2.3). */
  readonly modules: readonly BlixisModule[]
  /** Platform logger. Defaults to a JSON logger at level `info`. */
  readonly logger?: Logger
  /** Resolves the actor of each request (authentication). Defaults to the anonymous actor. */
  readonly actorResolver?: ActorResolver
  /** Accept an incoming `x-request-id` header (only behind a trusted proxy). Default `false`. */
  readonly trustRequestIdHeader?: boolean
  /**
   * Service replacements registered before any `setup` (intended for tests, see
   * `@blixis/testing`). Modules that provide an overridden token keep running; their
   * registration of that token is skipped.
   */
  readonly overrides?: readonly ServiceOverride[]
  /** Receives unexpected (5xx) errors of HTTP requests, e.g. for Sentry. */
  readonly errorReporter?: ErrorReporter
}

/**
 * A service replacement (see `CreateBlixisOptions.overrides`). Create it with
 * {@link serviceOverride} so the value is checked against the token's type.
 */
export interface ServiceOverride {
  readonly token: AnyServiceToken
  readonly value: unknown
}

/** Creates a type-checked {@link ServiceOverride}. */
export function serviceOverride<T>(token: ServiceToken<T>, value: T): ServiceOverride {
  return { token, value }
}

/** A composed Blixis application (architecture §43). */
export interface BlixisApp {
  /** Root Hono application (module routes mounted under `/api/v1`). */
  readonly hono: Hono<BlixisHonoEnv>
  /** App-scoped services (populated once {@link BlixisApp.ready} has resolved). */
  readonly services: ServiceRegistry
  /** Metadata of the registered modules in bootstrap order. */
  readonly modules: readonly ModuleMeta[]
  /** The platform logger (for runtime adapters). */
  readonly logger: Logger
  /** Permissions, event subscriptions, GraphQL fragments, and migrations contributed by modules. */
  readonly contributions: KernelContributions
  /** Runs `setup` and `boot` hooks once; subsequent calls return the same result. */
  ready(): Promise<void>
  /**
   * Handles a request (Fetch API / Workers compatible). Every route except the liveness check
   * `GET /api/v1/health` waits for `ready()`.
   */
  fetch(request: Request, env?: unknown, executionContext?: ExecutionContextLike): Promise<Response>
  /**
   * Runs `fn` in a fresh request scope with its own `RequestContext` (actor defaults to the
   * kernel's `system` actor) and disposes the scope afterwards. Used by queue consumers, cron
   * jobs, and workflow steps (ADR 0005). `bindings` are the platform bindings (Worker `env`).
   */
  runInScope<T>(
    seed: Parameters<RunInScope>[0] & { readonly bindings?: Readonly<Record<string, unknown>> },
    fn: (context: RequestContext) => Promise<T>,
  ): Promise<T>
  /**
   * Dispatches a queue batch to the consumer registered for `batch.queue`. Unknown queues are
   * logged and retried (never silently acknowledged).
   */
  queue(
    batch: QueueBatchLike,
    env?: unknown,
    executionContext?: ExecutionContextLike,
  ): Promise<void>
  /**
   * Runs every job registered for `event.cron`. All jobs run; if any fail, rejects with an
   * `AggregateError` afterwards so the invocation is reported as failed.
   */
  scheduled(
    event: ScheduledEventLike,
    env?: unknown,
    executionContext?: ExecutionContextLike,
  ): Promise<void>
}

type Phase = 'setup' | 'boot'

function hookError(module: ModuleMeta, phase: Phase, cause: unknown): ModuleError {
  const detail = cause instanceof Error ? cause.message : String(cause)
  return new ModuleError(module.name, `${phase} failed: ${detail}`, { cause })
}

/**
 * Composes modules into an application (architecture §5, §27, §43).
 *
 * Synchronous, so it can be used at module top level (`export default createBlixis(...)`):
 * it validates the module graph immediately and throws `ModuleValidationError` on problems.
 * `setup` and `boot` hooks run lazily in {@link BlixisApp.ready} — before the first request
 * or event — because Workers forbid I/O during global-scope initialisation and hooks may be
 * asynchronous.
 *
 * Before the first `setup`, every module's `config` is validated against its `configSchema`;
 * all failures are reported together in one `ModuleValidationError`.
 *
 * Failure semantics: a failing `setup` is a configuration error and is cached (every later
 * `ready()` rejects with it). A failing `boot` is retried on the next `ready()`, starting
 * with the module whose boot failed; boots that succeeded are not repeated.
 */
export function createBlixis(options: CreateBlixisOptions): BlixisApp {
  const ordered = validateModuleGraph(options.modules)
  const metas = Object.freeze(ordered.map((m) => m.meta))
  const { contributions, problems } = collectContributions(ordered)
  if (problems.length > 0) throw new ModuleValidationError(problems)
  const logger = options.logger ?? createJsonLogger()
  const container = new ServiceContainer()
  const hono = new Hono<BlixisHonoEnv>()
  const background = new BackgroundRegistry()
  const health = new HealthRegistry()
  const actorResolvers = new ActorResolverRegistry()
  container.forModule('@blixis/kernel').provide(KERNEL_CONTRIBUTIONS, contributions)
  container.forModule('@blixis/kernel').provide(BACKGROUND_HANDLERS, background)
  container.forModule('@blixis/kernel').provide(HEALTH_CHECKS, health)
  container.forModule('@blixis/kernel').provide(ACTOR_RESOLVERS, actorResolvers)
  if (options.errorReporter !== undefined)
    container.forModule('@blixis/kernel').provide(ERROR_REPORTER, options.errorReporter)
  container.forModule('@blixis/kernel').provideFactory(
    RUN_IN_SCOPE,
    ({ bindings }) =>
      <T>(seed: Parameters<RunInScope>[0], fn: (context: RequestContext) => Promise<T>) =>
        runInScope({ ...seed, bindings }, fn),
    { scope: 'request' },
  )
  for (const { token, value } of options.overrides ?? []) container.override(token, value)

  let setupResult: Promise<void> | undefined
  let bootedCount = 0
  let bootInFlight: Promise<void> | undefined

  const runSetup = async (): Promise<void> => {
    const configs = await validateModuleConfigs(ordered)
    for (const module of ordered) {
      if (module.setup === undefined) continue
      try {
        await module.setup({
          meta: module.meta,
          config: configs.get(module.meta.name),
          services: container.forModule(module.meta.name),
          logger: logger.child({ module: module.meta.name }),
        })
      } catch (error) {
        throw error instanceof ModuleError ? error : hookError(module.meta, 'setup', error)
      }
    }
    container.seal()
    background.lock()
    health.lock()
    actorResolvers.lock()
  }

  const runBoot = async (): Promise<void> => {
    while (bootedCount < ordered.length) {
      const module = ordered[bootedCount]
      if (module === undefined) break
      if (module.boot !== undefined) {
        try {
          await module.boot({
            meta: module.meta,
            services: container,
            logger: logger.child({ module: module.meta.name }),
            modules: metas,
          })
        } catch (error) {
          throw error instanceof ModuleError ? error : hookError(module.meta, 'boot', error)
        }
      }
      bootedCount++
    }
  }

  const ready = async (): Promise<void> => {
    setupResult ??= runSetup()
    await setupResult
    if (bootedCount === ordered.length) return
    bootInFlight ??= runBoot().finally(() => {
      bootInFlight = undefined
    })
    await bootInFlight
  }

  installRest(hono, ordered, {
    container,
    ready,
    logger,
    // An explicit resolver (tests) wins; otherwise the chain registered by modules (§30).
    actorResolver:
      options.actorResolver ?? ((request, services) => actorResolvers.resolve(request, services)),
    ...(options.trustRequestIdHeader === undefined
      ? {}
      : { trustRequestIdHeader: options.trustRequestIdHeader }),
    ...(options.errorReporter === undefined ? {} : { errorReporter: options.errorReporter }),
    healthChecks: health.checks,
  })

  const runInScope = async <T>(
    seed: Parameters<RunInScope>[0] & { readonly bindings?: Readonly<Record<string, unknown>> },
    fn: (context: RequestContext) => Promise<T>,
  ): Promise<T> => {
    await ready()
    const requestId = crypto.randomUUID()
    const correlationId = seed.correlationId ?? requestId
    const scope = container.createRequestScope(seed.bindings ?? {})
    const scopedLogger = logger.child({ requestId, correlationId })
    const context: RequestContext = {
      requestId,
      correlationId,
      actor: seed.actor ?? { type: 'system', component: '@blixis/kernel' },
      tenant: seed.tenant ?? {},
      logger: scopedLogger,
      services: scope.services,
      now: () => new Date(),
    }
    provideRequestContext(scope, context)
    try {
      return await fn(context)
    } finally {
      await scope.dispose().catch((error: unknown) => {
        scopedLogger.error('request scope disposal failed', { error: String(error) })
      })
    }
  }

  const backgroundContext = (env: unknown) => {
    const bindings = (env ?? {}) as Readonly<Record<string, unknown>>
    return {
      logger,
      runInScope: <T>(
        seed: Parameters<RunInScope>[0],
        fn: (context: RequestContext) => Promise<T>,
      ) => runInScope({ ...seed, bindings }, fn),
    }
  }

  return {
    hono,
    services: container,
    modules: metas,
    logger,
    contributions,
    ready,
    async fetch(request, env, executionContext) {
      return hono.fetch(request, env as Record<string, unknown>, executionContext as never)
    },
    runInScope,
    async queue(batch, env) {
      await ready()
      const handler = background.queues.get(batch.queue)
      if (handler === undefined) {
        logger.error('no consumer registered for queue; retrying batch', { queue: batch.queue })
        batch.retryAll()
        return
      }
      await handler(batch, backgroundContext(env))
    },
    async scheduled(event, env) {
      await ready()
      const handlers = background.crons.get(event.cron) ?? []
      if (handlers.length === 0) {
        logger.warn('no job registered for cron trigger', { cron: event.cron })
        return
      }
      const results = await Promise.allSettled(
        handlers.map((h) => h(event, backgroundContext(env))),
      )
      const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failures.length > 0) {
        for (const f of failures)
          logger.error('scheduled job failed', { cron: event.cron, error: String(f.reason) })
        throw new AggregateError(
          failures.map((f) => f.reason),
          `${failures.length} scheduled job(s) failed for ${event.cron}`,
        )
      }
    },
  }
}

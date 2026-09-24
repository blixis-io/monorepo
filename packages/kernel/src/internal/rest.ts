import {
  type Actor,
  ANONYMOUS_ACTOR,
  type BlixisModule,
  type Logger,
  ModuleError,
  NotFoundError,
  type RequestContext,
  type ServiceRegistry,
} from '@blixis/contracts'
import type { Hono } from 'hono'
import type { ErrorReporter } from '../error-reporter.ts'
import { type ModuleProblem, ModuleValidationError } from '../errors.ts'
import type { BlixisHonoEnv } from '../hono-env.ts'
import { toProblemResponse } from './errors-http.ts'
import type { ServiceContainer } from './services.ts'

/** Prefix of all module REST routes (architecture §9). */
export const API_PREFIX = '/api/v1'
/** Liveness endpoint; answered without waiting for module setup/boot. */
export const HEALTH_PATH = `${API_PREFIX}/health`

const KERNEL = '@blixis/kernel'
const TRACE_ID = /^[\w.:-]{1,128}$/

/** Resolves the actor of a request (authentication, plan 007). Defaults to anonymous. */
export type ActorResolver = (request: Request, services: ServiceRegistry) => Actor | Promise<Actor>

/** Options of the REST layer. */
export interface RestOptions {
  readonly container: ServiceContainer
  readonly ready: () => Promise<void>
  readonly logger: Logger
  readonly actorResolver?: ActorResolver
  /** Accept an incoming `x-request-id` header (only behind a trusted proxy). Default `false`. */
  readonly trustRequestIdHeader?: boolean
  /** Receives unexpected (5xx) errors, e.g. for Sentry. */
  readonly errorReporter?: ErrorReporter
}

function joinPath(prefix: string, path: string): string {
  const joined = `${prefix}/${path}`.replace(/\/{2,}/g, '/')
  return joined.length > 1 && joined.endsWith('/') ? joined.slice(0, -1) : joined
}

/**
 * Detects identical method + path registrations across modules (§26). Middleware (`ALL`) routes
 * are ignored — several modules may legitimately share a prefix such as `/spaces/:spaceId`.
 */
export function findRouteConflicts(modules: readonly BlixisModule[]): ModuleProblem[] {
  const owners = new Map<string, string>([[`GET ${HEALTH_PATH}`, KERNEL]])
  const problems: ModuleProblem[] = []
  for (const module of modules) {
    const rest = module.rest
    if (rest === undefined) continue
    if (!rest.path.startsWith('/')) {
      problems.push({
        module: module.meta.name,
        message: `rest.path "${rest.path}" must start with "/"`,
      })
      continue
    }
    for (const route of rest.app.routes) {
      if (route.method === 'ALL') continue
      const key = `${route.method} ${joinPath(joinPath(API_PREFIX, rest.path), route.path)}`
      const owner = owners.get(key)
      if (owner === undefined) owners.set(key, module.meta.name)
      else if (owner !== module.meta.name) {
        problems.push({ module: module.meta.name, message: `route ${key} conflicts with ${owner}` })
      }
    }
  }
  return problems
}

/** Installs kernel middleware, the health route, module routes, and error handlers. */
export function installRest(
  app: Hono<BlixisHonoEnv>,
  modules: readonly BlixisModule[],
  options: RestOptions,
): void {
  const conflicts = findRouteConflicts(modules)
  if (conflicts.length > 0) throw new ModuleValidationError(conflicts)

  app.get(HEALTH_PATH, (c) => c.json({ status: 'ok' }))

  app.use('*', async (c, next) => {
    const incomingRequestId = c.req.header('x-request-id')
    const requestId =
      options.trustRequestIdHeader === true &&
      incomingRequestId !== undefined &&
      TRACE_ID.test(incomingRequestId)
        ? incomingRequestId
        : crypto.randomUUID()
    const incomingCorrelation = c.req.header('x-correlation-id')
    const correlationId =
      incomingCorrelation !== undefined && TRACE_ID.test(incomingCorrelation)
        ? incomingCorrelation
        : requestId

    await options.ready()
    const scope = options.container.createRequestScope(
      (c.env ?? {}) as Readonly<Record<string, unknown>>,
    )
    const logger = options.logger.child({ requestId, correlationId })
    try {
      const actor = options.actorResolver
        ? await options.actorResolver(c.req.raw, scope.services)
        : ANONYMOUS_ACTOR
      const context: RequestContext = {
        requestId,
        correlationId,
        actor,
        tenant: {},
        logger,
        services: scope.services,
        now: () => new Date(),
        signal: c.req.raw.signal,
      }
      c.set('requestContext', context)
      c.set('services', scope.services)
      await next()
    } finally {
      c.header('x-request-id', requestId)
      c.header('x-correlation-id', correlationId)
      const disposal = scope.dispose().catch((error: unknown) => {
        logger.error('request scope disposal failed', { error: String(error) })
      })
      let executionCtx: { waitUntil(p: Promise<unknown>): void } | undefined
      try {
        executionCtx = c.executionCtx
      } catch {
        executionCtx = undefined
      }
      if (executionCtx === undefined) await disposal
      else executionCtx.waitUntil(disposal)
    }
  })

  for (const module of modules) {
    if (module.rest === undefined) continue
    app.route(
      joinPath(API_PREFIX, module.rest.path),
      module.rest.app as unknown as Hono<BlixisHonoEnv>,
    )
  }

  const requestIdOf = (c: { get(key: 'requestContext'): RequestContext | undefined }): string =>
    c.get('requestContext')?.requestId ?? crypto.randomUUID()

  app.notFound((c) => {
    const response = toProblemResponse(
      new NotFoundError(`No route for ${c.req.method} ${c.req.path}`),
      requestIdOf(c),
    )
    return response
  })

  app.onError((error, c) => {
    const requestId = requestIdOf(c)
    const response = toProblemResponse(error, requestId)
    if (response.status >= 500) {
      const context = c.get('requestContext') as RequestContext | undefined
      try {
        options.errorReporter?.captureException(error, {
          requestId,
          ...(context === undefined
            ? {}
            : { correlationId: context.correlationId, actorType: context.actor.type }),
          ...(context?.tenant.spaceId === undefined ? {} : { spaceId: context.tenant.spaceId }),
          ...(error instanceof ModuleError ? { module: error.moduleName } : {}),
          method: c.req.method,
          route: c.req.routePath,
          status: response.status,
        })
      } catch {
        // Error reporting must never break the response.
      }
      ;(context?.logger ?? options.logger).error('request failed', {
        requestId,
        status: response.status,
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      })
    }
    response.headers.set('x-request-id', requestId)
    return response
  })
}

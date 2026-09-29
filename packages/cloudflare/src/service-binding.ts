import {
  type Actor,
  type BlixisError,
  type CapabilityId,
  ConflictError,
  ForbiddenError,
  InfrastructureError,
  isBlixisError,
  NotFoundError,
  type PublicErrorShape,
  RateLimitError,
  REQUEST_CONTEXT,
  type ServiceToken,
  type TenantContext,
  toPublicErrorShape,
  UnauthorizedError,
  ValidationError,
  type ValidationIssue,
} from '@blixis-io/contracts'
import { type BlixisApp, defineModule } from '@blixis-io/kernel'

/**
 * Service Bindings between Blixis Workers (plan 020.005, architecture §18, §46). A module's
 * service can be served by another Worker without changing its callers:
 *
 * - the **serving** Worker exports a `WorkerEntrypoint` whose `call()` delegates to
 *   {@link handleServiceCall};
 * - the **calling** Worker registers {@link serviceBindingModule} for the service token instead
 *   of the module that implements it; callers keep using `services.get(TOKEN)`.
 *
 * One generic RPC method carries every call, with the caller's request context (correlation id,
 * actor, tenant), so the serving Worker authorizes, scopes, and logs exactly as if the call were
 * local. Playbook: `docs/architecture/worker-extraction.md`.
 */

/** What the serving Worker needs to know about the caller. */
export interface ServiceCallContext {
  readonly correlationId: string
  readonly actor: Actor
  readonly tenant: TenantContext
}

/**
 * One call over the binding. `args` and the result cross the RPC boundary with the structured
 * clone algorithm: plain data, arrays, `Date`, `Map`, `Set`, typed arrays, and streams survive;
 * class instances arrive as plain objects, functions and symbols are not allowed.
 */
export interface ServiceCall {
  /** The service token name; the serving Worker refuses calls for other services. */
  readonly service: string
  readonly method: string
  readonly args: readonly unknown[]
  readonly context: ServiceCallContext
}

/** Result of {@link handleServiceCall}. Errors travel as public shapes, never as stacks. */
export type ServiceCallResult =
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: PublicErrorShape }

/** The binding's RPC surface: an entrypoint whose `call()` runs {@link handleServiceCall}. */
export interface ServiceBindingLike {
  call(call: ServiceCall): Promise<ServiceCallResult>
}

const FORBIDDEN_METHODS = new Set(Object.getOwnPropertyNames(Object.prototype))

/**
 * Serving side: runs one call against the service registered for `token` in a fresh request
 * scope seeded with the caller's context, and returns the value or a public error. Unexpected
 * errors are logged here and cross the boundary without details.
 *
 * @example
 * export class ContentService extends WorkerEntrypoint<Env> {
 *   call(call: ServiceCall) {
 *     return handleServiceCall(app, CONTENT_SERVICE, call, this.env)
 *   }
 * }
 */
export async function handleServiceCall<T extends object>(
  app: BlixisApp,
  token: ServiceToken<T>,
  call: ServiceCall,
  env?: unknown,
): Promise<ServiceCallResult> {
  try {
    if (call.service !== token.name) throw new NotFoundError(`Unknown service ${call.service}`)
    if (FORBIDDEN_METHODS.has(call.method) || call.method.startsWith('_'))
      throw new NotFoundError(`Unknown method ${call.method}`)
    await app.ready()
    const value = await app.runInScope(
      {
        actor: call.context.actor,
        correlationId: call.context.correlationId,
        tenant: call.context.tenant,
        bindings: (env ?? {}) as Readonly<Record<string, unknown>>,
      },
      async ({ services, logger }) => {
        const service = services.get(token) as Record<string, unknown>
        const method = service[call.method]
        if (typeof method !== 'function') throw new NotFoundError(`Unknown method ${call.method}`)
        logger.debug('service_binding.call', { service: call.service, method: call.method })
        return (method as (...args: unknown[]) => unknown).apply(service, [...call.args])
      },
    )
    return { ok: true, value }
  } catch (error) {
    if (!isBlixisError(error) || !error.expose)
      app.logger.error('service_binding.failed', {
        service: call.service,
        method: call.method,
        correlationId: call.context.correlationId,
        error,
      })
    return { ok: false, error: toPublicErrorShape(error) }
  }
}

/** Rebuilds a public error on the calling side, so callers can keep `instanceof` checks. */
export function errorFromShape(shape: PublicErrorShape): BlixisError {
  const details = shape.details as { readonly issues?: readonly ValidationIssue[] } | undefined
  switch (shape.code) {
    case 'VALIDATION_FAILED':
      return new ValidationError(shape.message, details?.issues ?? [])
    case 'NOT_FOUND':
      return new NotFoundError(shape.message)
    case 'CONFLICT':
      return new ConflictError(shape.message)
    case 'FORBIDDEN':
      return new ForbiddenError(shape.message)
    case 'UNAUTHORIZED':
      return new UnauthorizedError(shape.message)
    case 'RATE_LIMITED':
      return new RateLimitError(shape.message)
    default:
      return new InfrastructureError('The remote service failed')
  }
}

/**
 * Calling side: an implementation of the service interface `T` whose methods call the binding.
 * Every method is async on the wire; services called this way must already return promises.
 */
export function createServiceBindingProxy<T extends object>(
  binding: ServiceBindingLike,
  token: ServiceToken<T>,
  context: () => ServiceCallContext,
): T {
  return new Proxy({} as T, {
    get(_target, property) {
      // Not a thenable, and no inherited Object members.
      if (typeof property !== 'string' || property === 'then' || FORBIDDEN_METHODS.has(property))
        return undefined
      return async (...args: unknown[]) => {
        let result: ServiceCallResult
        try {
          result = await binding.call({
            service: token.name,
            method: property,
            args,
            context: context(),
          })
        } catch (error) {
          throw new InfrastructureError(`Service binding call ${token.name}.${property} failed`, {
            cause: error,
          })
        }
        if (result.ok) return result.value
        throw errorFromShape(result.error)
      }
    },
  })
}

/** Options for {@link serviceBindingModule}. */
export interface ServiceBindingModuleOptions<T extends object> {
  /** Name of this module, e.g. `@blixis/content.remote`. */
  readonly name: string
  /** The service the remote Worker serves. */
  readonly token: ServiceToken<T>
  /** Name of the Service Binding in `wrangler.jsonc`, e.g. `CONTENT_SERVICE`. */
  readonly binding: string
  /** Capabilities the remote module provides, so dependants still resolve. */
  readonly capabilities?: readonly CapabilityId[]
}

/**
 * Provides `token` (request-scoped) through a Service Binding, in place of the module that
 * implements it. Register it in the composition root of the calling Worker and remove the local
 * module. The caller's request context travels with every call.
 */
export function serviceBindingModule<T extends object>(options: ServiceBindingModuleOptions<T>) {
  return defineModule(() => ({
    meta: {
      name: options.name,
      version: '0.0.0',
      ...(options.capabilities === undefined ? {} : { capabilities: options.capabilities }),
    },
    setup(ctx) {
      ctx.services.provideFactory(
        options.token,
        ({ services, bindings }) => {
          const binding = bindings[options.binding] as ServiceBindingLike | undefined
          if (binding === undefined || typeof binding.call !== 'function')
            throw new InfrastructureError(`Service binding ${options.binding} is not configured`)
          return createServiceBindingProxy(binding, options.token, () => {
            const request = services.get(REQUEST_CONTEXT)
            return {
              correlationId: request.correlationId,
              actor: request.actor,
              tenant: request.tenant,
            }
          })
        },
        { scope: 'request' },
      )
    },
  }))()
}

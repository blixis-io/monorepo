import { InfrastructureError, type StandardSchemaV1 } from '@blixis/contracts'
import { type BlixisApp, toProblemResponse } from '@blixis/kernel'
import { parseEnv } from './env.ts'

/** The Worker default export produced by {@link createWorkerHandler} (all handlers present). */
export interface WorkerHandler<TEnv> extends ExportedHandler<TEnv> {
  fetch: ExportedHandlerFetchHandler<TEnv>
  queue: ExportedHandlerQueueHandler<TEnv>
  scheduled: ExportedHandlerScheduledHandler<TEnv>
}

/** Options for {@link createWorkerHandler}. */
export interface WorkerHandlerOptions {
  /**
   * Schema of the Worker environment (variables and secrets). Validated on the first
   * invocation of each isolate (and again only if the runtime passes a different `env`
   * object). Invalid configuration fails every invocation: HTTP gets a 500 problem response,
   * queue batches are retried, cron runs fail. Logs name the invalid keys, never values.
   */
  readonly envSchema?: StandardSchemaV1
}

/**
 * Builds the Worker's default export from a Blixis app (architecture §12): `fetch` for HTTP,
 * `queue` for Cloudflare Queues consumers, and `scheduled` for Cron Triggers. Each invocation
 * gets its own request scope inside the kernel; the Worker `env` is passed through as the
 * scope's bindings.
 *
 * @example
 * const app = createBlixis({ modules })
 * export default createWorkerHandler<Env>(app, { envSchema: apiEnvSchema })
 */
export function createWorkerHandler<TEnv = unknown>(
  app: BlixisApp,
  options: WorkerHandlerOptions = {},
): WorkerHandler<TEnv> {
  const validated = new WeakMap<object, true>()

  /** Throws a non-exposed `InfrastructureError` when the environment is invalid. */
  const checkEnv = (env: unknown): void => {
    const schema = options.envSchema
    if (schema === undefined || typeof env !== 'object' || env === null || validated.has(env))
      return
    try {
      parseEnv(env, schema)
      validated.set(env, true)
    } catch (error) {
      app.logger.error('invalid Worker environment', {
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }

  return {
    fetch: async (request, env, ctx) => {
      try {
        checkEnv(env)
      } catch (error) {
        const problem =
          error instanceof InfrastructureError
            ? error
            : new InfrastructureError('Invalid environment')
        return toProblemResponse(problem, crypto.randomUUID())
      }
      return app.fetch(request as unknown as Request, env, ctx)
    },
    queue: async (batch, env, ctx) => {
      try {
        checkEnv(env)
      } catch (error) {
        batch.retryAll()
        throw error
      }
      await app.queue(batch, env, ctx)
    },
    scheduled: async (controller, env, ctx) => {
      checkEnv(env)
      await app.scheduled(
        { cron: controller.cron, scheduledTime: controller.scheduledTime },
        env,
        ctx,
      )
    },
  }
}

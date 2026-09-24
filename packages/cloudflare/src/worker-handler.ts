import type { BlixisApp } from '@blixis/kernel'

/**
 * Builds the Worker's default export from a Blixis app (architecture §12): `fetch` for HTTP,
 * `queue` for Cloudflare Queues consumers, and `scheduled` for Cron Triggers. Each invocation
 * gets its own request scope inside the kernel; the Worker `env` is passed through as the
 * scope's bindings.
 *
 * @example
 * const app = createBlixis({ modules })
 * export default createWorkerHandler<Env>(app)
 */
export function createWorkerHandler<TEnv = unknown>(app: BlixisApp): ExportedHandler<TEnv> {
  return {
    fetch: (request, env, ctx) => app.fetch(request as unknown as Request, env, ctx),
    queue: (batch, env, ctx) => app.queue(batch, env, ctx),
    scheduled: (controller, env, ctx) =>
      app.scheduled({ cron: controller.cron, scheduledTime: controller.scheduledTime }, env, ctx),
  }
}

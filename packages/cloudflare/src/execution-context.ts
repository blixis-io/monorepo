import type { Logger } from '@blixis/contracts'

/** The subset of Cloudflare's `ExecutionContext` Blixis needs. */
export interface WaitUntilContext {
  waitUntil(promise: Promise<unknown>): void
}

/**
 * Runs background work after the response with `ctx.waitUntil`, logging failures instead of
 * letting them become unhandled rejections (no floating promises, code standards §8).
 */
export function waitUntilSafe(
  ctx: WaitUntilContext,
  promise: Promise<unknown>,
  logger: Logger,
  label = 'background task',
): void {
  ctx.waitUntil(
    promise.catch((error: unknown) => {
      logger.error(`${label} failed`, {
        error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
      })
    }),
  )
}

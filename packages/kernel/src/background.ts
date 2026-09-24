import {
  type Actor,
  createServiceToken,
  type Logger,
  ModuleError,
  type RequestContext,
  type TenantContext,
} from '@blixis/contracts'

/** One queue message, structurally compatible with Cloudflare's `Message`. */
export interface QueueMessageLike {
  readonly id: string
  readonly body: unknown
  readonly attempts: number
  ack(): void
  retry(options?: { delaySeconds?: number }): void
}

/** A batch of queue messages, structurally compatible with Cloudflare's `MessageBatch`. */
export interface QueueBatchLike {
  readonly queue: string
  readonly messages: readonly QueueMessageLike[]
  ackAll(): void
  retryAll(options?: { delaySeconds?: number }): void
}

/** A cron invocation, structurally compatible with Cloudflare's `ScheduledController`. */
export interface ScheduledEventLike {
  readonly cron: string
  readonly scheduledTime: number
}

/** Seed for a background request scope. */
export interface ScopeSeed {
  /** Defaults to a `system` actor for the kernel. */
  readonly actor?: Actor
  /** Continue a trace, e.g. from an event's metadata; defaults to the new request id. */
  readonly correlationId?: string
  readonly tenant?: TenantContext
}

/** Runs `fn` in a fresh request scope; the scope is disposed afterwards. */
export type RunInScope = <T>(
  seed: ScopeSeed,
  fn: (context: RequestContext) => Promise<T>,
) => Promise<T>

/** Tools available to background handlers. */
export interface BackgroundContext {
  readonly logger: Logger
  /** Creates one request scope per unit of work (per message, per job). */
  readonly runInScope: RunInScope
}

/** Handles all messages of one queue. Must ack or retry each message. */
export type QueueHandler = (batch: QueueBatchLike, context: BackgroundContext) => Promise<void>

/** Handles one cron trigger. */
export type ScheduledHandler = (
  event: ScheduledEventLike,
  context: BackgroundContext,
) => Promise<void>

/**
 * Registry for queue consumers and cron jobs. Platform packages (events, database, …)
 * register handlers during `setup`; the Worker adapter dispatches to them.
 */
export interface BackgroundHandlers {
  /** Registers the consumer of `queue`. One consumer per queue. */
  onQueue(queue: string, handler: QueueHandler): void
  /** Registers a job for the cron expression `cron` (as written in `wrangler.jsonc`). */
  onScheduled(cron: string, handler: ScheduledHandler): void
}

/** Service token of the kernel's {@link BackgroundHandlers} registry (app scope). */
export const BACKGROUND_HANDLERS = createServiceToken<BackgroundHandlers>(
  '@blixis/kernel.background',
)

/** Kernel-internal implementation of {@link BackgroundHandlers}. */
export class BackgroundRegistry implements BackgroundHandlers {
  readonly queues = new Map<string, QueueHandler>()
  readonly crons = new Map<string, ScheduledHandler[]>()
  #locked = false

  onQueue(queue: string, handler: QueueHandler): void {
    this.#assertOpen(`queue ${queue}`)
    if (this.queues.has(queue))
      throw new ModuleError('@blixis/kernel', `queue ${queue} already has a consumer`)
    this.queues.set(queue, handler)
  }

  onScheduled(cron: string, handler: ScheduledHandler): void {
    this.#assertOpen(`cron ${cron}`)
    this.crons.set(cron, [...(this.crons.get(cron) ?? []), handler])
  }

  /** Prevents registrations after setup. */
  lock(): void {
    this.#locked = true
  }

  #assertOpen(what: string): void {
    if (this.#locked) throw new ModuleError('@blixis/kernel', `cannot register ${what} after setup`)
  }
}

import type { BlixisModule, Logger, ModuleMeta, ServiceRegistry } from '@blixis/contracts'
import { ModuleError } from '@blixis/contracts'
import { Hono } from 'hono'
import { validateModuleConfigs } from './internal/config.ts'
import { validateModuleGraph } from './internal/graph.ts'
import { ServiceContainer } from './internal/services.ts'
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
}

/** A composed Blixis application (architecture §43). */
export interface BlixisApp {
  /** Root Hono application. */
  readonly hono: Hono
  /** App-scoped services (populated once {@link BlixisApp.ready} has resolved). */
  readonly services: ServiceRegistry
  /** Metadata of the registered modules in bootstrap order. */
  readonly modules: readonly ModuleMeta[]
  /** Runs `setup` and `boot` hooks once; subsequent calls return the same result. */
  ready(): Promise<void>
  /** Handles a request (Fetch API / Workers compatible). Waits for `ready()`. */
  fetch(request: Request, env?: unknown, executionContext?: ExecutionContextLike): Promise<Response>
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
  const logger = options.logger ?? createJsonLogger()
  const container = new ServiceContainer()
  const hono = new Hono()

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

  return {
    hono,
    services: container,
    modules: metas,
    ready,
    async fetch(request, env, executionContext) {
      await ready()
      return hono.fetch(request, env, executionContext as never)
    },
  }
}

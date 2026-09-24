import { createServiceToken, ModuleError, type ServiceRegistry } from '@blixis/contracts'

/**
 * A readiness check contributed by a platform module (e.g. "can we query the database").
 * `check` resolves when the dependency is usable and rejects otherwise. It runs in a fresh
 * request scope, so it may resolve request-scoped services such as the database.
 */
export interface HealthCheck {
  /** Unique name, shown in the readiness response (e.g. `database`). */
  readonly name: string
  /** Fails the check after this many milliseconds. Default 2000. */
  readonly timeoutMs?: number
  check(services: ServiceRegistry): Promise<void>
}

/** Registry of readiness checks; platform modules register during `setup`. */
export interface HealthChecks {
  register(check: HealthCheck): void
}

/** Service token of the kernel's {@link HealthChecks} registry (app scope). */
export const HEALTH_CHECKS = createServiceToken<HealthChecks>('@blixis/kernel.health')

/** Result of one check. Never contains error messages (they may name hosts). */
export interface HealthCheckResult {
  readonly status: 'ok' | 'fail' | 'timeout'
  readonly latencyMs: number
}

/** Body of `GET /api/v1/health/ready`. */
export interface ReadinessReport {
  readonly status: 'ok' | 'unavailable'
  readonly checks: Readonly<Record<string, HealthCheckResult>>
}

/** Kernel-internal implementation of {@link HealthChecks}. */
export class HealthRegistry implements HealthChecks {
  readonly checks: HealthCheck[] = []
  #locked = false

  register(check: HealthCheck): void {
    if (this.#locked) {
      throw new ModuleError(
        '@blixis/kernel',
        `cannot register health check ${check.name} after setup`,
      )
    }
    if (this.checks.some((existing) => existing.name === check.name)) {
      throw new ModuleError('@blixis/kernel', `health check ${check.name} is registered twice`)
    }
    this.checks.push(check)
  }

  /** Prevents registrations after setup. */
  lock(): void {
    this.#locked = true
  }
}

const TIMEOUT = Symbol('timeout')

/**
 * Runs all checks concurrently, each bounded by its timeout. `onFailure` receives the error of a
 * failed check for logging; the report itself only carries status and latency.
 */
export async function runHealthChecks(
  checks: readonly HealthCheck[],
  services: ServiceRegistry,
  onFailure: (name: string, error: unknown) => void,
): Promise<ReadinessReport> {
  const results = await Promise.all(
    checks.map(async (check): Promise<[string, HealthCheckResult]> => {
      const started = Date.now()
      let timer: ReturnType<typeof setTimeout> | undefined
      const timeout = new Promise<typeof TIMEOUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), check.timeoutMs ?? 2000)
      })
      try {
        const outcome = await Promise.race([check.check(services), timeout])
        const latencyMs = Date.now() - started
        if (outcome === TIMEOUT) {
          onFailure(check.name, new Error(`timed out after ${check.timeoutMs ?? 2000} ms`))
          return [check.name, { status: 'timeout', latencyMs }]
        }
        return [check.name, { status: 'ok', latencyMs }]
      } catch (error) {
        onFailure(check.name, error)
        return [check.name, { status: 'fail', latencyMs: Date.now() - started }]
      } finally {
        clearTimeout(timer)
      }
    }),
  )
  const report = Object.fromEntries(results)
  const ok = results.every(([, result]) => result.status === 'ok')
  return { status: ok ? 'ok' : 'unavailable', checks: report }
}

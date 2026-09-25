import type { Actor } from '@blixis/contracts'
import type { BlixisApp } from '@blixis/kernel'
import type { TestBlixis } from './create-test-blixis.ts'

/** A tenant-scoped route to probe: a registered pattern plus an optional body. */
export interface IsolationRoute {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** The route pattern exactly as registered, e.g. `/api/v1/spaces/:spaceId/locales/:localeId`. */
  readonly path: string
  readonly body?: unknown
  /**
   * Maps a route parameter to a differently named entry of the params, when one parameter name
   * means different things on different routes, e.g. `{ membershipId: 'orgMembershipId' }`.
   */
  readonly paramsFrom?: Readonly<Record<string, string>>
}

/** Route parameters pointing at the **victim** tenant's resources (`orgId`, `spaceId`, …). */
export type IsolationParams = Readonly<Record<string, string>>

/** Statuses that count as "isolated": the intruder learns nothing and changes nothing. */
const ISOLATED = [403, 404]

/** The concrete URL of `route` for `params` (honouring {@link IsolationRoute.paramsFrom}). */
export function isolationUrl(route: IsolationRoute, params: IsolationParams): string {
  return fill(route.path, params, route.paramsFrom ?? {})
}

function fill(
  pattern: string,
  params: IsolationParams,
  from: Readonly<Record<string, string>>,
): string {
  return pattern.replace(/:(\w+)/g, (_match, name: string) => {
    const value = params[from[name] ?? name]
    if (value === undefined) throw new Error(`No isolation param for :${name} in ${pattern}`)
    return value
  })
}

/**
 * Sends every route as `intruder` against the victim's ids and asserts each answers 403/404 and
 * that the victim's data is unchanged (`fingerprint` before vs. after) — roadmap 008.006.
 * Returns a list of failures (empty when isolated), so one run reports every leak at once.
 */
export async function expectIsolated(options: {
  readonly t: TestBlixis
  readonly routes: readonly IsolationRoute[]
  readonly params: IsolationParams
  readonly intruder: Actor
  /** Snapshot of the victim's data (e.g. a JSON of rows); must be equal before and after. */
  readonly fingerprint: () => Promise<unknown>
}): Promise<string[]> {
  const failures: string[] = []
  const before = JSON.stringify(await options.fingerprint())
  for (const route of options.routes) {
    const res = await options.t.request(isolationUrl(route, options.params), {
      method: route.method,
      actor: options.intruder,
      ...(route.body === undefined ? {} : { json: route.body }),
    })
    if (!ISOLATED.includes(res.status))
      failures.push(`${route.method} ${route.path} → ${res.status}`)
  }
  const after = JSON.stringify(await options.fingerprint())
  if (after !== before) failures.push('victim data changed during isolation probes')
  return failures
}

/** Whether a route pattern is tenant-scoped (has an organization or space parameter). */
export const isTenantScoped = (path: string): boolean =>
  /\/(organizations\/:orgId|spaces\/:spaceId)(\/|$)/.test(path)

/**
 * Tenant-scoped routes of `app` that no isolation spec covers and that are not allow-listed —
 * CI fails on these, so a new module route can't skip the isolation suite.
 */
export function uncoveredTenantRoutes(
  app: BlixisApp,
  routes: readonly IsolationRoute[],
  allowList: readonly string[] = [],
): string[] {
  const covered = new Set(routes.map((r) => `${r.method} ${r.path}`))
  const allowed = new Set(allowList)
  return app.hono.routes
    .filter((route) => route.method !== 'ALL' && isTenantScoped(route.path))
    .map((route) => `${route.method} ${route.path}`)
    .filter((key) => !covered.has(key) && !allowed.has(key))
}

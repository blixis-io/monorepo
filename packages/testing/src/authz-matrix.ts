import { type Actor, isPermissionId, type PermissionId } from '@blixis/contracts'
import type { TestBlixis } from './create-test-blixis.ts'
import { type IsolationParams, type IsolationRoute, isolationUrl } from './isolation.ts'

/** Tenant level a route's permission is checked at. */
export type AuthzLevel = 'organization' | 'space'

/** A permission-guarded route: the request to send and the permission it requires. */
export interface AuthzRoute extends IsolationRoute {
  /** The permission the route's service requires. */
  readonly permission: PermissionId
  /** Whether the permission is checked on the organization or on a space of it. */
  readonly level: AuthzLevel
}

/**
 * One actor in the matrix, in a tenant of its own: `setup` seeds a fresh tenant (so routes that
 * change or delete data can succeed for every case) and returns the actor and route params.
 */
export interface AuthzCase {
  readonly name: string
  readonly setup: () => Promise<{ readonly actor: Actor; readonly params: IsolationParams }>
  /**
   * Permissions the actor holds at `level` in that tenant; `undefined` when it has no membership
   * there (the route must answer 404). Ignored for anonymous actors (always 401).
   */
  readonly permissions: (level: AuthzLevel) => ReadonlySet<string> | undefined
}

/**
 * Declares the permission-guarded routes of a matrix (roadmap 009.005). Rows run in order for
 * each case, so list reads before changes and deletions of shared fixtures last.
 * @throws TypeError for invalid permission ids and duplicate rows
 */
export function defineAuthzMatrix(routes: readonly AuthzRoute[]): readonly AuthzRoute[] {
  const seen = new Set<string>()
  for (const route of routes) {
    const key = `${route.method} ${route.path}`
    if (!isPermissionId(route.permission))
      throw new TypeError(`${key}: invalid permission id "${route.permission}"`)
    if (seen.has(key)) throw new TypeError(`${key} is listed twice`)
    seen.add(key)
  }
  return Object.freeze([...routes])
}

/** The status a case must get: 401 anonymous, 404 non-member, 2xx allowed, 403 otherwise. */
export function expectedAuthzStatus(
  actor: Actor,
  held: ReadonlySet<string> | undefined,
  permission: PermissionId,
): 401 | 404 | 403 | '2xx' {
  if (actor.type === 'anonymous') return 401
  if (held === undefined) return 404
  return held.has(permission) ? '2xx' : 403
}

/**
 * Sends every route as every case (role × route × tenant × actor type) and compares the status
 * with what the case's permissions imply. Returns failures such as
 * `viewer: POST /api/v1/spaces/:spaceId/locales → 201 (expected 403)`; empty when all pass.
 */
export async function checkAuthzMatrix(options: {
  readonly t: TestBlixis
  readonly routes: readonly AuthzRoute[]
  readonly cases: readonly AuthzCase[]
}): Promise<string[]> {
  const failures: string[] = []
  for (const matrixCase of options.cases) {
    const { actor, params } = await matrixCase.setup()
    for (const route of options.routes) {
      const expected = expectedAuthzStatus(
        actor,
        matrixCase.permissions(route.level),
        route.permission,
      )
      const res = await options.t.request(isolationUrl(route, params), {
        method: route.method,
        actor,
        ...(route.body === undefined ? {} : { json: route.body }),
      })
      const ok =
        expected === '2xx' ? res.status >= 200 && res.status < 300 : res.status === expected
      if (!ok) {
        const detail = res.status >= 400 ? `: ${(await res.text()).slice(0, 160)}` : ''
        failures.push(
          `${matrixCase.name}: ${route.method} ${route.path} → ${res.status} (expected ${expected})${detail}`,
        )
      }
    }
  }
  return failures
}

import { assetsModule } from '@blixis-io/assets'
import { AUTH_CONFIG, authModule, generateSigningKey } from '@blixis-io/auth'
import { contentModule } from '@blixis-io/content'
import {
  type BlixisModule,
  OBJECT_STORAGE,
  type RestContribution,
  type RestOperation,
} from '@blixis-io/contracts'
import { databaseModule } from '@blixis-io/database'
import { idempotencyModule } from '@blixis-io/database/idempotency'
import { graphqlModule } from '@blixis-io/graphql'
import { permissionsModule } from '@blixis-io/permissions'
import { spacesModule } from '@blixis-io/spaces'
import {
  captureEvents,
  createMemoryObjectStorage,
  createTestBlixis,
  serviceOverride,
} from '@blixis-io/testing'
import type { TestDatabase } from '@blixis-io/testing/database'
import { usersModule } from '@blixis-io/users'
import {
  generateWebhookKey,
  WEBHOOK_FETCH,
  WEBHOOKS_CONFIG,
  webhooksModule,
} from '@blixis-io/webhooks'

export const apiModules = (): BlixisModule[] => [
  databaseModule(),
  idempotencyModule(),
  usersModule(),
  authModule({ allowSignUp: true }),
  spacesModule(),
  permissionsModule(),
  contentModule({ stampTtlMs: 0 }),
  assetsModule(),
  webhooksModule(),
  graphqlModule(),
]

interface Schema {
  '~standard': {
    validate(
      value: unknown,
    ): { issues?: readonly { message: string; path?: readonly unknown[] }[] } | Promise<unknown>
  }
}

/** Every documented operation with a matcher for its full path. */
function operationIndex(modules: readonly BlixisModule[]) {
  return modules.flatMap((module) => {
    const rests =
      module.rest === undefined
        ? []
        : Array.isArray(module.rest)
          ? module.rest
          : [module.rest as RestContribution]
    return rests.flatMap((rest) =>
      (rest.operations ?? []).map((op: RestOperation) => {
        const full = `${rest.root === true ? '' : '/api/v1'}/${rest.path}/${op.path}`
          .replace(/\/+/g, '/')
          .replace(/(.)\/$/, '$1')
        return { op, pattern: new RegExp(`^${full.replace(/:\w+/g, '[^/]+')}$`) }
      }),
    )
  })
}

/**
 * The API in-process for SDK contract tests: real modules, real sign-in, memory storage, no
 * network. Every JSON response is validated against its documented operation schema; the
 * mismatches are collected in `violations` (tests assert it stays empty).
 */
export async function createApi(db: TestDatabase) {
  const events = captureEvents({ mode: 'deferred' })
  const modules = apiModules()
  const t = await createTestBlixis({
    modules: [...modules, events.module()],
    database: db,
    overrides: [
      serviceOverride(AUTH_CONFIG, {
        signingKeys: JSON.stringify([await generateSigningKey('sdk-test')]),
        allowedOrigins: [],
      }),
      serviceOverride(OBJECT_STORAGE, createMemoryObjectStorage()),
      serviceOverride(WEBHOOKS_CONFIG, {
        secretKeys: generateWebhookKey('sdk'),
        allowPrivateUrls: false,
      }),
      serviceOverride(WEBHOOK_FETCH, async () => new Response(null, { status: 204 })),
    ],
  })
  const index = operationIndex(modules)
  const violations: string[] = []
  const seen = new Set<string>()
  const lastCache: { value: string | null } = { value: null }
  const fetch = async (request: Request): Promise<Response> => {
    const response = await t.app.fetch(request)
    await events.flush()
    const { pathname } = new URL(request.url)
    lastCache.value = response.headers.get('x-blixis-cache')
    // GraphQL has its own schema; only REST responses are checked against operations.
    if (pathname === '/graphql') return response
    const match = index.find((i) => i.op.method === request.method && i.pattern.test(pathname))
    if (match === undefined) {
      violations.push(`${request.method} ${pathname}: no documented operation`)
      return response
    }
    seen.add(match.op.id)
    const documented = match.op.responses[response.status]
    if (response.status >= 400) return response
    if (documented === undefined) {
      violations.push(`${match.op.id}: undocumented status ${response.status}`)
      return response
    }
    if (documented.schema !== undefined) {
      const body = await response.clone().json()
      const result = await (documented.schema as unknown as Schema)['~standard'].validate(body)
      const issues = (
        result as { issues?: readonly { message: string; path?: readonly unknown[] }[] }
      ).issues
      if (issues !== undefined && issues.length > 0)
        violations.push(
          `${match.op.id} ${response.status}: ${issues
            .slice(0, 3)
            .map(
              (i) =>
                `${(i.path ?? []).map((p) => (typeof p === 'object' && p !== null && 'key' in p ? (p as { key: unknown }).key : p)).join('.')} ${i.message}`,
            )
            .join('; ')}`,
        )
    }
    return response
  }
  return { t, fetch, violations, seen, lastCache, baseUrl: 'http://blixis.test' }
}

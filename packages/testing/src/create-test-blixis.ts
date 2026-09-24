import type { Actor, BlixisModule, ServiceRegistry } from '@blixis/contracts'
import { type BlixisApp, createBlixis, type ServiceOverride } from '@blixis/kernel'
import { asAnonymous, encodeTestActor, TEST_ACTOR_HEADER } from './actors.ts'
import { type CapturingLogger, createCapturingLogger } from './logger.ts'

/** Options for {@link createTestBlixis}. */
export interface CreateTestBlixisOptions {
  readonly modules: readonly BlixisModule[]
  /** Replace services (e.g. with fakes) before any module's `setup` runs. */
  readonly overrides?: readonly ServiceOverride[]
  /** Default actor of every request. Defaults to anonymous. */
  readonly actor?: Actor
}

/** Request options of {@link TestBlixis.request}. */
export interface TestRequestInit extends RequestInit {
  /** Actor for this request (overrides the default actor). */
  readonly actor?: Actor
  /** JSON body; sets `content-type: application/json`. */
  readonly json?: unknown
}

/** A booted Blixis application for tests. */
export interface TestBlixis {
  readonly app: BlixisApp
  /** App-scoped services. */
  readonly services: ServiceRegistry
  /** Everything the platform and modules logged. */
  readonly logs: CapturingLogger
  /** Sends a request to the app. `path` may be relative, e.g. `/api/v1/things`. */
  request(path: string, init?: TestRequestInit): Promise<Response>
}

/**
 * Creates and boots a Blixis app for module integration tests (architecture §36). Runs module
 * `setup` and `boot` hooks before resolving, so setup errors surface in the test.
 *
 * @example
 * const t = await createTestBlixis({ modules: [content(), seo()] })
 * const res = await t.request('/api/v1/seo/entries/1', { actor: asUser('u1') })
 */
export async function createTestBlixis(options: CreateTestBlixisOptions): Promise<TestBlixis> {
  const logs = createCapturingLogger()
  const defaultActor = options.actor ?? asAnonymous()
  const app = createBlixis({
    modules: options.modules,
    logger: logs,
    ...(options.overrides === undefined ? {} : { overrides: options.overrides }),
    actorResolver: (request) => {
      const header = request.headers.get(TEST_ACTOR_HEADER)
      return header === null ? defaultActor : (JSON.parse(header) as Actor)
    },
  })
  await app.ready()
  return {
    app,
    services: app.services,
    logs,
    request(path, init = {}) {
      const { actor, json, headers, ...rest } = init
      const requestHeaders = new Headers(headers)
      if (actor !== undefined) requestHeaders.set(TEST_ACTOR_HEADER, encodeTestActor(actor))
      if (json !== undefined) requestHeaders.set('content-type', 'application/json')
      const body = json === undefined ? rest.body : JSON.stringify(json)
      return app.fetch(
        new Request(new URL(path, 'http://blixis.test'), {
          ...rest,
          headers: requestHeaders,
          ...(body === undefined || body === null ? {} : { body }),
        }),
      )
    },
  }
}

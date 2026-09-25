# `@blixis/kernel` — maintainer notes

User-facing documentation is in the developer manual ([concepts/modules](../../apps/docs/src/content/docs/concepts/modules.mdx)) and the generated API reference. This page records how the kernel works internally.

## Bootstrap sequence

```text
createBlixis({ modules })            ← synchronous (safe at Worker top level)
  ├─ validateModuleGraph()           names, versions, requires, capabilities, cycles → order
  ├─ new ServiceContainer()
  ├─ new Hono<BlixisHonoEnv>()
  ├─ installRest()                   route-conflict check, health, context middleware, module routes, error handlers
  └─ return BlixisApp

app.ready()   (first request/event, memoised)
  ├─ setup hooks, in bootstrap order   ctx: meta, config, services (provide/get), logger
  ├─ container.seal()
  └─ boot hooks, in bootstrap order    ctx: meta, services (read), logger, modules
```

- **Why setup is lazy:** hooks may be async (`void | Promise<void>`) and Workers forbid I/O during global-scope initialisation; running them on first use keeps `createBlixis` synchronous.
- **Failure semantics:** a failing `setup` is a configuration error → cached; every later `ready()` rejects with the same `ModuleError`. A failing `boot` is retried on the next `ready()`, starting at the module that failed; successful boots are not repeated. Concurrent `ready()` calls share one in-flight boot.
- **Errors:** hook errors are wrapped as `ModuleError` (`[module] setup failed: …` / `boot failed: …`) with the original as `cause`; `ModuleError`s thrown by hooks pass through unchanged.
- **Services:** see [ADR 0005](../decisions/0005-service-scopes.md). The container is sealed after setup.
- **Logger:** `createJsonLogger` (JSON lines to the console) is the default until the platform logger with redaction lands (020.001).

## Contributions

`collectContributions` (called synchronously in `createBlixis`) gathers `permissions`, `events` (subscriptions), `graphql`, and `migrations` per module in bootstrap order, attributed to the module, frozen, and exposed as `app.contributions` and the app-scoped `KERNEL_CONTRIBUTIONS` service (provided by `@blixis/kernel` before module setup). Checks: valid permission ids; no duplicate permission ids; **permission namespace ownership** (first id segment belongs to the first module that declares it); unique subscription ids per module; valid (`NNNN_snake_case`) and unique migration ids per module. GraphQL is only collected — parsing and type-conflict checks happen in `@blixis/graphql` (012.002).

## Background work (queues, cron, workflows)

- `app.runInScope(seed, fn)` — awaits `ready()`, creates a request scope (with `bindings`), builds a `RequestContext` (actor defaults to `{ type: 'system', component: '@blixis/kernel' }`, correlation id from the seed or a new request id), runs `fn`, disposes the scope (disposal errors logged).
- `BACKGROUND_HANDLERS` (app-scoped service): platform packages call `onQueue(queue, handler)` / `onScheduled(cron, handler)` **during setup**; locked afterwards. One consumer per queue; several jobs per cron.
- `app.queue(batch, env)` → registered consumer (unknown queue: logged + `retryAll()`); `app.scheduled(event, env)` → all jobs for that cron (all run; failures → `AggregateError`). Handlers receive `{ logger, runInScope }` and should create one scope per unit of work (per message/job).
- Types are structural (`QueueBatchLike`, `ScheduledEventLike`) so the kernel never imports Cloudflare types; `@blixis/cloudflare`'s `createWorkerHandler(app)` maps the Worker's `fetch`/`queue`/`scheduled` onto the app.
- **Bindings:** request-scoped factories receive the invocation's platform bindings (`ServiceResolutionContext.bindings` = Worker `env`; `{}` for app scope). Platform packages only.

## REST layer

- Order: `GET /api/v1/health` (liveness, no `ready()`), then `use('*')` middleware: request id (random; incoming `x-request-id` only with `trustRequestIdHeader`), correlation id (incoming `x-correlation-id` if it matches `[\w.:-]{1,128}`), `await ready()`, request scope, actor resolution, `RequestContext` → `c.var`, then module routes; response headers `x-request-id`/`x-correlation-id`; scope disposed via `executionCtx.waitUntil` when available, otherwise awaited.
- Mount path: `/api/v1` + `rest.path` (normalised). Conflicts: identical `METHOD path` across modules (Hono `ALL` middleware entries ignored); checked synchronously in `createBlixis`.
- Errors: `onError`/`notFound` return RFC 9457 problem details via `toProblemResponse` (`toPublicErrorShape` redaction). 5xx are logged with the request logger and passed to the optional `errorReporter`:
  - context: `requestId`, `correlationId`, `method`, `route` pattern, `status`, `actorType`, `spaceId`, `module` for `ModuleError`;
  - a throwing reporter is ignored;
  - 4xx are never reported.

## Actor resolution

Authentication modules register resolvers with `ctx.services.get(ACTOR_RESOLVERS).register({ name, resolve })` during `setup`. For each request, the kernel runs them in module order:
- The first resolver that returns an actor wins.
- A resolver returns `undefined` for credentials that aren't its kind.
- A resolver throws `UnauthorizedError` for credentials of its kind that are invalid.

A request with an `Authorization` header that no resolver claims gets a `401`. It is never treated as anonymous. Without credentials, the request is anonymous.

Resolvers run **before** the request context exists, so they must not resolve services that need `REQUEST_CONTEXT`. An explicit `createBlixis({ actorResolver })` (used by `@blixis/testing`) replaces the chain; `createTestBlixis` falls back to the chain for requests that carry an `Authorization` header and no test actor.

## Request context as a service

Every request scope (HTTP request, `runInScope` for queue messages and cron jobs) provides the current `RequestContext` as `REQUEST_CONTEXT` (from contracts). Request-scoped services read correlation ID, actor, and tenant from it; for example, the event bus stamps them on envelopes. Internally, the scope's `provideValue(token, value)` sets it; such values need no registration and are not disposed.

## Health and readiness

- **Liveness:** `GET /api/v1/health` returns `{ status: 'ok' }`. It does no I/O and doesn't wait for `ready()`.
- **Readiness:** `GET /api/v1/health/ready`.
  - It waits for `ready()`, then runs every registered check concurrently in a fresh request scope, each with its own timeout (default 2 s).
  - It answers `200 { status: 'ok', checks: { <name>: { status, latencyMs } } }`, or `503 { status: 'unavailable', … }` when boot failed (`checks.boot`) or any check failed or timed out.
  - Responses carry `cache-control: no-store` and never contain error messages. Failures are logged at `warn`.
- **Registering checks:** platform modules register them in `setup` with `ctx.services.get(HEALTH_CHECKS).register({ name, timeoutMs?, check(services) })`. Names are unique, and registration is closed after setup. `databaseModule()` registers `database` (`select 1`).

## Gotchas

- **TypeScript 7.0.2:** a `{@link Interface.member}` tag in the JSDoc of a member *inside that same interface* breaks name resolution for the member's signature (`TS2304: Cannot find name 'Request'`). Use backticks instead of `{@link}` there.
- The kernel compiles with `lib: ["es2023", "webworker"]` for Fetch API and `console` types; the shared base config stays ES-only.

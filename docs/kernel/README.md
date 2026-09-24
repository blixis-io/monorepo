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

## REST layer

- Order: `GET /api/v1/health` (liveness, no `ready()`), then `use('*')` middleware: request id (random; incoming `x-request-id` only with `trustRequestIdHeader`), correlation id (incoming `x-correlation-id` if it matches `[\w.:-]{1,128}`), `await ready()`, request scope, actor resolution, `RequestContext` → `c.var`, then module routes; response headers `x-request-id`/`x-correlation-id`; scope disposed via `executionCtx.waitUntil` when available, otherwise awaited.
- Mount path: `/api/v1` + `rest.path` (normalised). Conflicts: identical `METHOD path` across modules (Hono `ALL` middleware entries ignored); checked synchronously in `createBlixis`.
- Errors: `onError`/`notFound` return RFC 9457 problem details via `toProblemResponse` (`toPublicErrorShape` redaction); 5xx are logged with the request logger.

## Gotchas

- **TypeScript 7.0.2:** a `{@link Interface.member}` tag in the JSDoc of a member *inside that same interface* breaks name resolution for the member's signature (`TS2304: Cannot find name 'Request'`). Use backticks instead of `{@link}` there.
- The kernel compiles with `lib: ["es2023", "webworker"]` for Fetch API and `console` types; the shared base config stays ES-only.

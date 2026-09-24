# 0005 — Service scopes on Workers

- Status: accepted
- Date: 2026-09-24
- Roadmap task: [003.003](../plans/003-module-kernel/003-service-registry-and-scopes.md)

## Context

Modules share behaviour through typed service tokens (§7). On Cloudflare Workers, I/O objects — database connections, sockets, streams, `Response` bodies — created while handling one request **cannot be used from another request**; the runtime throws. Hyperdrive therefore expects a new client per request (pooling happens inside Hyperdrive). At the same time most services (validators, configuration, pure domain services) are stateless and should be created once per isolate. Worker isolates also forbid I/O during global-scope initialisation, which is when `createBlixis` runs.

The contracts' `ServiceRegistry.get` is synchronous (`get(token): T`), so every consumer — route handlers, resolvers, other services — can resolve services without `await`.

## Decision

1. **Two scopes:**
   - **`app`** — one instance per isolate. Registered with `provide(token, value)` or `provideFactory(token, factory, { scope: 'app' })` (lazy, created on first `get`). Must not hold I/O objects.
   - **`request`** — one instance per *request scope*, created lazily on first `get` within that scope, disposed when the scope ends via the optional `dispose(value)` callback, in **reverse creation order**. For anything holding I/O (database clients, per-request caches).
2. **Request scopes are created by transports**, not by modules: the REST middleware (003.006), the queue consumer and cron handler (004.003, 006.004), and Workflow steps (016.001) call `createRequestScope()` and dispose it after the invocation (`ctx.waitUntil` on Workers). Each event handler invocation gets its own scope.
3. **Factories are synchronous.** `provideFactory`'s factory returns `T`, never a promise, so `get` stays synchronous. Services that need asynchronous initialisation connect lazily on first use (e.g. a database client that connects on its first query) or prepare app-scoped state in the module's `boot` hook.
4. **Scope rule:** an app-scoped factory may only resolve app-scoped services. Resolving a request-scoped service from an app-scoped factory, or outside any request scope, throws `ModuleError`. Request-scoped factories may resolve both.
5. **Registration rules:** registrations happen during `setup` only (the registry is sealed afterwards); a second provider for the same token fails startup, naming both modules; a missing service throws `ModuleError` naming the requesting module (when known) and the token.
6. **Disposal is best-effort but complete:** every disposer runs; failures are collected into an `AggregateError` after all have been attempted; the transport logs it.
7. **No child containers, decorators, or auto-wiring.** Tokens + factories are enough; explicit is better than magic (§1).

## Alternatives considered

- **Async `get`** — would make every consumer `await` services and complicate handlers; rejected.
- **Async factories resolved eagerly per request** — would open connections for requests that never use them; rejected.
- **Single scope (everything per request)** — wasteful for stateless services and loses isolate-level caching.
- **A DI framework (tsyringe, inversify)** — decorators/reflection, Node assumptions, and implicit wiring; contradicts §1 and §38.

## Consequences

- Database and other I/O clients must expose lazy connection (`@blixis/database`, 005.002).
- Transports must always create and dispose a scope around each invocation; the kernel provides the helper, so modules never do this themselves.
- Circular resolutions are detected and reported with the module name.

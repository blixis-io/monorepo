# Extracting a Worker

Blixis runs as **one API Worker** (architecture §46). This playbook describes how to move a module, or the Delivery API, into its own Worker when there is a reason to, using the Service Binding adapter from `@blixis-io/cloudflare` (plan 020.005). Nothing is split today.

Related: architecture §18 (Service Bindings), §45 (Management and Delivery APIs), §46 (modular monolith first) · [observability](../operations/observability.md) · [Cloudflare](../operations/cloudflare.md)

## When to extract

Only with a concrete reason from §46, written down in an ADR:

| Reason | Example |
|---|---|
| Independent deployment | Delivery must deploy without touching management (release cadence, risk). |
| Separate scaling or cost profile | Delivery traffic is orders of magnitude above management traffic and needs its own limits and caching. |
| Security boundary | A component handling secrets or untrusted input should not share an isolate with the rest (e.g. third-party plugins, §39 phase 3). |
| CPU-intensive work | Image processing, exports, search indexing that would hit the request CPU limit. |
| Isolated ownership | Another team owns and releases the component. |
| Specialized bindings | The component needs bindings the API Worker should not have (e.g. a Vectorize index, Workers AI). |

Not reasons: "microservices are cleaner", bundle size alone (check the 10 MiB limit first), or one slow module (fix the module).

**Cost of a split:** one extra hop per cross-Worker call (usually on the same machine, but not free), a second deploy and its ordering, two sets of bindings and secrets, and a network boundary for every call that crosses it.

## How a split works

```text
 Calling Worker (e.g. API)                         Serving Worker (e.g. content)
 ─────────────────────────                         ─────────────────────────────
 services.get(CONTENT_SERVICE)                     class ContentEntrypoint extends WorkerEntrypoint
   └─ serviceBindingModule proxy ──── RPC call() ──▶   handleServiceCall(app, CONTENT_SERVICE, call)
        + { correlationId, actor, tenant }               └─ app.runInScope(caller context)
                                                             └─ services.get(CONTENT_SERVICE).method(...)
      ◀──────── { ok, value } | { ok: false, error: PublicErrorShape } ──────────
```

- **Callers don't change.** They keep `services.get(TOKEN)`; the calling Worker registers `serviceBindingModule({ token, binding })` instead of the module that implements the token.
- **Context travels with every call:** correlation id, actor, and tenant. The serving Worker runs the method in a request scope seeded with them, so authorization, tenant scoping, and logs behave as if the call were local, and the trace keeps one `correlationId` across both Workers.
- **Errors:** public errors (`ValidationError`, `NotFoundError`, …) are rebuilt on the calling side, so `instanceof` checks keep working. Unexpected errors are logged in the serving Worker (`service_binding.failed`) and arrive as `InfrastructureError` without details. Transport failures (binding missing or down) are `InfrastructureError` too.
- **Only methods of the service.** Names starting with `_` and `Object.prototype` members are refused, as are calls for another token.

### Serialization constraints

Arguments and results cross the boundary with the structured clone algorithm (Workers RPC):

- **Survive:** plain objects and arrays, strings, numbers, booleans, `null`, `undefined`, `bigint`, `Date`, `Map`, `Set`, typed arrays, `ArrayBuffer`, `ReadableStream`, `Request`/`Response`.
- **Change:** class instances arrive as plain objects (no methods, no `instanceof`); errors inside values lose their class.
- **Not allowed:** functions, symbols, and callbacks. A service method that takes a callback (or returns an object with methods) must get a data-only variant before it can be extracted.
- **Everything is async.** Every method becomes a promise; synchronous service methods must become async first.
- **Transactions don't cross.** A method that accepts a `transaction` (e.g. emitting an event in the caller's transaction) can't be called remotely: the serving Worker has its own database connection. Keep such calls on one side, or replace them with events.
- Keep payloads small; RPC has size limits, and large values are better streamed or passed by id.

## Steps

1. **ADR.** Record the reason (table above), the boundary (which tokens move), and what stays shared (database, queues, R2).
2. **Check the service interface** against the serialization constraints. Fix callbacks, synchronous methods, transaction parameters, and class-typed results first, in the monolith, with tests.
3. **New Worker package** `apps/<name>` with its own `wrangler.jsonc`: the modules that implement the moved tokens, plus the platform modules they need (`databaseModule`, events, …). Same compatibility date and flags as the API Worker. It needs no public route unless it also serves HTTP (`workers_dev: false`, no custom domain).
4. **Entrypoint.** Export a `WorkerEntrypoint` whose `call()` delegates to `handleServiceCall(app, TOKEN, call, this.env)` (one entrypoint per token, or one that switches on `call.service`).
5. **Bindings and secrets.** Give the new Worker exactly the bindings its modules need (Hyperdrive, queues, R2, secrets) and remove them from the API Worker if nothing there uses them any more. Each binding and secret exists per environment.
6. **Calling Worker.** In `wrangler.jsonc` add a service binding per environment, e.g. `"services": [{ "binding": "CONTENT_SERVICE", "service": "blixis-content-staging", "entrypoint": "ContentEntrypoint" }]`, then run `pnpm --filter @blixis-io/api types`. In `blixis.config.ts` replace the module with `serviceBindingModule({ name: '@blixis/content.remote', token: CONTENT_SERVICE, binding: 'CONTENT_SERVICE', capabilities: [...] })`, declaring the capabilities the module provided.
7. **Authentication and authorization.** The actor is resolved by the calling Worker and trusted by the serving Worker: a Service Binding can only be called by Workers bound to it in the same account, never from the internet. Keep authorization inside the service methods (as today), so the serving Worker checks permissions itself. Don't give the serving Worker a public route unless it resolves actors itself.
8. **Events and migrations.** Modules keep owning their Postgres schema; migrations still run from the monorepo before either Worker deploys. Event subscriptions move with the module: the new Worker consumes the events queue (its own consumer, or a separate queue if volumes differ).
9. **Observability.** Enable `observability` in the new Worker's config with the same sampling, add it to Sentry (`withSentry`, same DSN, its own release), and add its cron (if any) as a Sentry cron monitor. Traces join by `correlationId`; the new Worker logs `service_binding.failed` for unexpected errors.
10. **Deploy order.** Serving Worker first, so the calling Worker's binding resolves to code that has the entrypoint; then the calling Worker. Roll back in reverse. Add both to the deploy pipeline (021.001) and the post-deploy smoke.
11. **Tests.** Keep the service's own tests; add a Workers-pool test with the new Worker as an auxiliary Worker (pattern: `apps/api/test/service-binding.worker.test.ts` and its fixture), and run the tenant-isolation and authz suites against the calling Worker.

## Example: splitting the Delivery API (§45)

The most likely first split: GraphQL delivery (`/graphql`, `/assets/...`) into `blixis-delivery`, management REST staying in `blixis-api`.

- **Reason:** separate scaling and caching profile, independent deploys of the public read path.
- **What moves:** `graphqlModule` and the delivery-side modules (content delivery schema, asset delivery route), plus `databaseModule`, auth (delivery-key resolution only), and the delivery cache. They share the database and R2 bucket with the API Worker.
- **What doesn't need a binding:** delivery reads the database directly, so no service calls cross in the common path. The Delivery Worker still subscribes to the content events that invalidate its cache (delivery stamps), from its own queue consumer or through the shared events queue.
- **Where bindings are needed:** only where management code calls into delivery or the other way round (for example cache invalidation triggered synchronously from the API). Prefer events for those; use `serviceBindingModule` where a synchronous answer is required.
- **Routing:** `api.<domain>` → `blixis-api`; `cdn.<domain>` or a route on `/graphql` and `/assets/*` → `blixis-delivery`. Rate limits and WAF rules per Worker.

## Adapter reference

`@blixis-io/cloudflare`:

| Export | Side | Purpose |
|---|---|---|
| `handleServiceCall(app, token, call, env)` | serving | Runs one call in a request scope seeded with the caller context; returns `{ ok, value }` or a public error. |
| `serviceBindingModule({ name, token, binding, capabilities })` | calling | Provides `token` (request-scoped) through the named binding, with the current request context. |
| `createServiceBindingProxy(binding, token, context)` | calling | The proxy itself, for code outside the module system. |
| `errorFromShape(shape)` | calling | Rebuilds a public error from its shape. |
| `ServiceCall`, `ServiceCallContext`, `ServiceCallResult`, `ServiceBindingLike` | both | Wire types. |

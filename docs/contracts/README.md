# `@blixis/contracts`

The public contract surface for Blixis modules — first-party and third-party alike (architecture §2.2, §4). It is the primary dependency for module authors and is kept **small, stable, and dependency-free**.

Related: [Package conventions](../conventions/packages.md) · [Code standards](../conventions/code-standards.md) · [Plan 002](../plans/002-public-contracts/_index.md)

---

## What belongs here

| Allowed | Not allowed |
|---|---|
| TypeScript interfaces and public types | Database clients |
| Service tokens (`createServiceToken`) | Hono app instances (type-only references are allowed) |
| Module, lifecycle, and capability contracts | Cloudflare bindings |
| Event envelope/definition contracts | GraphQL server instances |
| Permission and actor types | Concrete service implementations |
| Public error classes | Business logic |
| Small pure helpers (`validate`, `defineEvent`) | Runtime dependencies of any kind |

## Stability policy

- Semantic versioning. Any change that breaks a module compiled against a previous version is a **major** change (`feat(contracts)!:` + `BREAKING CHANGE:` footer).
- New APIs whose shape may still change are marked `@experimental` in TSDoc.
- Every export has TSDoc.
- The package has **no runtime `dependencies`** (enforced by `tooling/boundaries`). The only peer is **`hono`** (`^4.13.0`), used **type-only** for `RestContribution` — no runtime import exists in `dist`.

## Contents

| Area | Source | Status |
|---|---|---|
| Module contract, lifecycle contexts, contributions | `src/module.ts` | ✅ 002.002 |
| Service tokens and registry interfaces | `src/services.ts` | ✅ 002.003 |
| Capabilities | `src/capabilities.ts` | ✅ 002.003 |
| Public errors | `src/errors.ts` | ✅ 002.004 — see [errors.md](./errors.md) |
| Validation (Standard Schema) | `src/validation.ts`, `src/standard-schema.ts` | ✅ 002.005 |
| Events | `src/events.ts` | ✅ 002.006 — see [events.md](./events.md) |
| Actors and permissions | `src/permissions.ts` | ✅ 002.007 |
| Request context, logger, migrations | `src/context.ts`, `src/migrations.ts` | ✅ 002.008 |

## Module contract

A module is a plain object (usually returned by a factory) implementing `BlixisModule` (§5, §6):

```ts
import { Hono } from 'hono'
import { z } from 'zod'
import { type ModuleFactory, type ModuleHonoEnv, definePermission } from '@blixis/contracts'

const Config = z.object({ defaultTitle: z.string().default('Untitled') })

const routes = new Hono<ModuleHonoEnv>().get('/entries/:id/seo', (c) =>
  c.json({ requestId: c.var.requestContext.requestId }),
)

const seo: ModuleFactory<{ defaultTitle?: string }, z.infer<typeof Config>> = (options = {}) => ({
  meta: { name: '@acme/blixis-seo', version: '1.0.0', requiresCapabilities: ['blixis.content'] },
  config: options,               // raw options…
  configSchema: Config,           // …validated by the kernel into ctx.config
  setup(ctx) { /* ctx.services.provide(...) — no I/O here */ },
  boot(ctx) { /* runs once, lazily, before the first request */ },
  rest: { path: '/seo', app: routes },                       // mounted at /api/v1/seo
  graphql: { typeDefs: 'extend type Entry { seoTitle: String }' },
  permissions: [definePermission({ id: 'seo.read', description: 'Read SEO metadata' })],
  events: [/* subscribe(entryPublished, 'refresh-seo', handler) */],
  migrations: [/* defineMigration({ id: '0001_create_seo', up: '…' }) */],
})
export default seo
```

- **Lifecycle:** `setup` (register services; synchronous work only — Workers forbid I/O at global scope) → `boot` (lazy, once) → ready (§27). No other hooks.
- **REST:** create routes with `new Hono<ModuleHonoEnv>()`; read `c.var.requestContext` and `c.var.services`. There are no `Bindings` in module routes — domain code never touches Cloudflare `env`. Sub-apps with other variables are rejected at compile time.
- **Hono typing decision:** contracts reference Hono **types only** (`import type`), with `hono` as a peer dependency, because Hono is the fixed framework (§9) and a structural stand-in would lose route typing.
- **Config:** a factory puts raw options in `config`; the kernel validates them with `configSchema` (any Standard Schema) and passes the output as `ctx.config` (003.005).
- **`ModuleFactory<TOptions, TConfig>`:** `ModuleFactory` without options is `() => BlixisModule`; `defineModule` in `@blixis/kernel` (003.001) is an optional convenience around the same shape.

## Services

Services are looked up by **typed tokens**, never by strings (§7):

```ts
import { createServiceToken } from '@blixis/contracts'

export interface SeoService { titleFor(entryId: string): Promise<string> }
export const SEO_SERVICE = createServiceToken<SeoService>('@acme/blixis-seo.service')

// in setup(ctx):  ctx.services.provide(SEO_SERVICE, seoService)
// elsewhere:      const seo = ctx.services.get(SEO_SERVICE)   // typed as SeoService
```

- Token identity is `Symbol.for(name)`, so two copies of a package still share tokens. Name tokens `<package>.<service>`.
- `ServiceRegistry` (`get`, `getOptional`, `has`) is the read side; `ServiceProvider` (`provide`, `provideFactory`) is available during `setup`.
- Scopes: `app` (per isolate, no I/O objects) and `request` (per request/event, disposable — e.g. DB clients). The scope API is `@experimental` until the kernel registry (003.003) finalises it.

## Capabilities

Capabilities let a module depend on *behaviour* instead of a package name (§8). IDs follow `<namespace>.<capability>` (lowercase, kebab-case segments); `blixis.*` is reserved for first-party modules (`BLIXIS_CAPABILITIES`). Declare them in `meta.capabilities` (provided) and `meta.requiresCapabilities` (required).

## Validation

Contracts are **library-agnostic**: they use the [Standard Schema](https://standardschema.dev) interface (`StandardSchemaV1`, vendored). First-party code uses **Zod 4** ([ADR 0004](../decisions/0004-validation-library.md)); third-party modules may use any compliant library.

```ts
import { validate } from '@blixis/contracts'
import { z } from 'zod'

const CreateEntry = z.object({ title: z.string().min(1) })
const input = await validate(CreateEntry, await request.json())  // typed; throws ValidationError
```

- `validate` (async) / `validateSync` throw `ValidationError` with `issues: { path, message, code? }[]`.
- `InferOutput<S>` / `InferInput<S>` derive types from schemas — do not hand-write duplicates.
- Worker entry points call `z.config({ jitless: true })` (Workers forbid `eval`).

## Actors and permissions

Authentication produces an **`Actor`**; authorization decides whether it may act (§30).

| Actor `type` | Meaning |
|---|---|
| `user` | Signed-in user (session) |
| `apiToken` | Personal API token — owner's permissions ∩ `scopes` |
| `deliveryKey` | Space-scoped delivery/preview key (content delivery only) |
| `system` | Platform code (queue consumers, cron, Workflows); denied unless a check sets `allowSystem` |
| `anonymous` | No credentials (`ANONYMOUS_ACTOR`) |

Permissions are strings `<module>.<action>` / `<module>.<resource>.<action>` declared by modules (`definePermission`). Services check them through `AUTHORIZATION_SERVICE`:

```ts
await ctx.services.get(AUTHORIZATION_SERVICE).require({
  actor, action: 'content.publish', resource: { type: 'entry', id, spaceId },
})
```

`ResourceRef` must carry `organizationId`/`spaceId` for tenant-scoped resources (§31). Roles never appear in contracts — they are an implementation detail of `@blixis/permissions` (plan 009). No role-name checks anywhere.

## Request context, logging, and migrations

- **`RequestContext`** — what every service call receives, regardless of transport (§2.4): `requestId`, `correlationId`, `actor`, `tenant` (`organizationId`/`spaceId`/`environmentId`), `logger`, request-scoped `services`, `now()`, optional cancellation `signal`.
- **`Logger`** — `debug/info/warn/error(message, fields)` + `child(fields)`. Use §35 field names (`requestId`, `correlationId`, `tenantId`, `spaceId`, `actorId`, `module`, `eventType`, `eventId`, `duration`, `status`). Never log secrets.
- **`TransactionScope`** — opaque handle created by `@blixis/database`; pass it to `events.emit(…, { transaction })` for transactional events.
- **`MigrationDefinition`** / **`defineMigration`** — module-owned migrations with ids `NNNN_snake_case`; steps are SQL or functions receiving a minimal `MigrationExecutor`. They run from tooling/CI, never in the Worker.

## Testing

- Runtime helpers: `src/**/*.test.ts` (Vitest, Node project).
- Types: `src/**/*.test-d.ts` using Vitest's `expectTypeOf`, **type-checked by `pnpm typecheck`** through `packages/contracts/tsconfig.test.json` (not executed by Vitest).

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
- The package has **no runtime `dependencies`** (enforced by `tooling/boundaries`); type-only peers are documented below.

## Contents

| Area | Source | Status |
|---|---|---|
| Module contract, lifecycle contexts, contributions | `src/module.ts` | planned — 002.002 |
| Service tokens and registry interfaces | `src/services.ts` | ✅ 002.003 |
| Capabilities | `src/capabilities.ts` | ✅ 002.003 |
| Public errors | `src/errors.ts` | planned — 002.004 |
| Validation (Standard Schema) | `src/validation.ts` | planned — 002.005 |
| Events | `src/events.ts` | planned — 002.006 |
| Actors and permissions | `src/permissions.ts` | planned — 002.007 |
| Request context, logger, migrations | `src/context.ts`, `src/migrations.ts` | planned — 002.008 |

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

## Testing

- Runtime helpers: `src/**/*.test.ts` (Vitest, Node project).
- Types: `src/**/*.test-d.ts` using Vitest's `expectTypeOf`, **type-checked by `pnpm typecheck`** through `packages/contracts/tsconfig.test.json` (not executed by Vitest).

# Package Conventions

How every package in the Blixis monorepo is shaped. The reference implementation is [`packages/shared`](../../packages/shared). Build and module settings follow [ADR 0001](../decisions/0001-typescript-7-build-strategy.md).

Related: [Monorepo](../development/monorepo.md) · [Code standards](./code-standards.md) · [Testing](./testing.md)

---

## Where a package lives

| Directory | Contains | Published? |
|---|---|---|
| `packages/` | Platform packages: contracts, kernel, cloudflare, database, events, graphql, sdk, testing, shared, content-api | Candidates for npm (decided per package in 018.005) |
| `modules/` | Domain modules, one package each (auth, users, spaces, permissions, content, assets, webhooks, releases) | Later, when third parties need them |
| `apps/` | Deployables: `api` (Worker), `admin`, `example-site` | Never (`"private": true`) |
| `tooling/` | Dev-only packages: tsconfig presets, boundary checker, db CLI, smoke/load tests | Never (`"private": true`) |
| `examples/` | Example third-party plugins, **outside** the workspace | No |

## Directory layout

```text
packages/<name>/
├── package.json
├── tsconfig.json          # build: extends @blixis/tsconfig/library.json
├── tsconfig.test.json     # tests: extends @blixis/tsconfig/test.json (TS7 errors if it matches no files)
├── README.md              # optional; required for published packages
└── src/
    ├── index.ts           # the ONLY public entry
    ├── <feature>.ts
    └── <feature>.test.ts  # unit tests next to the code
```

Domain modules use the §23 layout inside `src/` (`domain/`, `application/`, `infrastructure/`, `rest/`, `graphql/`, `events/`) — only the folders they need.

## `package.json`

```json
{
  "name": "@blixis/<name>",
  "version": "0.0.0",
  "description": "One sentence.",
  "type": "module",
  "sideEffects": false,
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run --root ../.. packages/<name>"
  },
  "dependencies": {},
  "peerDependencies": {},
  "devDependencies": {
    "@blixis/tsconfig": "workspace:*",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/blixis-io/monorepo.git",
    "directory": "packages/<name>"
  }
}
```

Rules:

- **Name:** `@blixis/<name>` for everything first-party (§48 Packages.1). Tooling packages use `@blixis/<name>` too and are `"private": true`.
- **ESM only:** `"type": "module"`; no CommonJS output.
- **`exports`: root entry only.** Additional subpaths need a documented reason (e.g. `@blixis/tsconfig/*.json`). Never expose `src/` or internal files (§24).
- **`types` condition first**, then `default`.
- **`files: ["dist"]`** — only built output is published.
- **`sideEffects: false`** unless the package really has import-time side effects (then document why).
- **Versions:** `0.0.0` until the package enters the release tooling (018.005).
- **Workspace dependencies:** `"workspace:*"`. **Third-party versions:** `"catalog:"` (see [Monorepo](../development/monorepo.md#dependency-versions)).

### `dependencies` vs. `peerDependencies`

| Situation | Use |
|---|---|
| Runtime code the package itself needs | `dependencies` |
| Shared platform contract a *host* must provide exactly once (`@blixis/contracts`, `@blixis/kernel` for modules) | `peerDependencies` (+ `devDependencies` for local builds) — §25 |
| Framework the host app provides (`hono` types in contracts) | `peerDependencies` |
| Build/test tooling | `devDependencies` |

Domain modules and third-party modules peer-depend on `@blixis/contracts`; `autoInstallPeers` is off, so the consuming app declares peers explicitly.

## TypeScript

```jsonc
// tsconfig.json — build (emits dist/)
{ "extends": "@blixis/tsconfig/library.json", "references": [{ "path": "../contracts" }] }

// tsconfig.test.json — type-checks tests, never emits
{ "extends": "@blixis/tsconfig/test.json", "references": [{ "path": "./tsconfig.json" }] }
```

- Add a `references` entry for every workspace package the package depends on.
- Register both configs in the root `tsconfig.json` `references` (the root is a solution file only).
- Relative imports use the `.ts` extension: `import { x } from './x.ts'`.
- Worker apps extend `@blixis/tsconfig/worker.json` (type-check only; Wrangler bundles).

## Source rules

- `src/index.ts` re-exports the public API explicitly (named exports). Domain module packages also default-export their module factory.
- No other barrel files.
- Every export of a public package has TSDoc.
- Web-platform APIs only in anything that can end up in a Worker; Node built-ins only in `tooling/*` (enforced by lint).

## Forbidden patterns

| Pattern | Why | Enforced by |
|---|---|---|
| `import … from '@blixis/x/src/…'` or any non-exported subpath | breaks the package contract (§24, §25) | `exports` map (tsc/Node/bundlers) + Biome `noRestrictedImports` |
| Relative import that leaves the package (`../../other/src/…`) | bypasses `exports` | `tooling/boundaries` |
| Workspace dependency cycles | §48 Packages.7 | `tooling/boundaries` |
| Importing a workspace package not declared in `package.json` | hidden coupling | `tooling/boundaries` |
| `@blixis/testing` in non-test files | test code in production bundles | `tooling/boundaries` |
| `modules/*` → `@blixis/cloudflare` | domain code must not touch bindings (§4) | `tooling/boundaries` |
| Default-exported "god objects" / service locators by string | untyped coupling (§7) | review |
| `paths` aliases in tsconfig | bypass `exports` | review |

The boundary checker and lint rules are added in task 001.005.

## Creating a package — checklist

1. Create the directory in the right location (table above).
2. Copy `package.json` and `tsconfig.json` from the template above; fill in name, description, `directory`.
3. Add `src/index.ts`.
4. Add workspace deps (`workspace:*`) and tsconfig `references`.
5. Add the package (and later its `tsconfig.test.json`) to the root `tsconfig.json` references.
6. `pnpm install && pnpm typecheck && pnpm build && pnpm lint && pnpm test`.
7. Domain modules: register the factory in `apps/api/src/blixis.config.ts` explicitly (§2.3).

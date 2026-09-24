# Monorepo

Blixis is a **pnpm workspace** monorepo (architecture §3). This document defines the target layout and the workspace-level configuration. The files themselves are created by roadmap plan [001 — Project Foundation](../plans/001-project-foundation/_index.md); per-package rules are written in `docs/conventions/packages.md` by task 001.004.

Related: [Getting started](./getting-started.md) · [Code standards](../conventions/code-standards.md) · [Cloudflare Workers](../operations/cloudflare.md) · [GitHub Actions](../operations/github-actions.md)

---

## Layout

```text
monorepo/
├── apps/                    # deployables (private, never published)
│   ├── api/                 # @blixis/api — Cloudflare Worker: REST + GraphQL (composition root)
│   ├── admin/               # @blixis/admin — React + shadcn/ui admin
│   └── example-site/        # example-site — Astro consumer of @blixis/sdk
├── packages/                # platform packages (@blixis/*)
│   ├── contracts/           # public contracts (primary dependency for module authors)
│   ├── kernel/              # module composition, lifecycle, service registry, REST mounting
│   ├── cloudflare/          # binding adapters: Queues, KV, R2, Cache, Workflows, Service Bindings
│   ├── database/            # Postgres via Hyperdrive, transactions, migrations
│   ├── events/              # event bus, outbox, idempotency
│   ├── graphql/             # GraphQL Yoga integration and schema composition
│   ├── content-api/         # public content capability contracts (plan 018)
│   ├── sdk/                 # client SDK
│   ├── testing/             # test utilities (test-only)
│   └── shared/              # tiny shared utilities
├── modules/                 # domain modules (@blixis/*), one package each
│   ├── auth/  users/  spaces/  permissions/
│   ├── content/  assets/  webhooks/  releases/
├── tooling/                 # dev-only packages: tsconfig presets, db CLI, smoke/load tests, boundary checks
├── examples/                # example third-party plugin — NOT part of the workspace (plan 018)
├── docs/
├── .github/
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
└── README.md
```

Dependency direction (never the reverse):

```text
apps ──▶ modules ──▶ packages (contracts, kernel, database, events, …) ──▶ contracts
                        tooling is dev-only; examples consume packed tarballs
```

- `modules/*` must not depend on `@blixis/cloudflare` (bindings stay in adapters).
- `apps/admin` depends only on `@blixis/sdk` (plus UI libraries).
- Nothing depends on `apps/*`.

## `pnpm-workspace.yaml`

```yaml
packages:
  - apps/*
  - packages/*
  - modules/*
  - tooling/*
  # examples/* is intentionally excluded: plugins are installed from packed tarballs (plan 018)

# Shared dependency versions — referenced as "catalog:" in package.json files
catalog:
  typescript: <7.x — pinned by ADR 0001>
  hono: <x.y.z>
  wrangler: <x.y.z>
  vitest: <x.y.z>
  "@cloudflare/vitest-pool-workers": <x.y.z>

# pnpm ≥ 10 blocks dependency lifecycle scripts by default; allow-list only what needs them
onlyBuiltDependencies:
  - esbuild
  - workerd
```

Exact versions are filled in by task 001.001/001.002. Keep `onlyBuiltDependencies` minimal and justified.

## Root `package.json`

```jsonc
{
  "name": "blixis",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@<exact version>",
  "engines": { "node": ">=<active LTS>" },
  "scripts": {
    "build": "pnpm -r --workspace-concurrency=4 build",
    "typecheck": "tsc -b",                       // TS7 CLI per ADR 0001
    "lint": "<linter> && pnpm boundaries",
    "format": "<formatter> --write .",
    "format:check": "<formatter> --check .",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "db:migrate": "pnpm --filter @blixis/db-tooling migrate",
    "db:status": "pnpm --filter @blixis/db-tooling status",
    "dev": "pnpm --filter @blixis/api dev"
  }
}
```

`pnpm -r` runs scripts in topological order. A task runner (e.g. Turborepo) is **not** used initially; add one only when measured build/test times justify it (§38).

## Internal dependencies

- Reference workspace packages with `"workspace:*"` in `dependencies` / `peerDependencies`.
- Reference shared third-party versions with `"catalog:"`.
- Import other packages only by name (`@blixis/kernel`), never by relative path.
- Whether workspace consumers resolve package `src` or built `dist` is decided in ADR 0001 (task 001.002).

## Dependency versions

- One version per third-party dependency across the repo, managed in the catalog.
- Cloudflare tooling (`wrangler`, `@cloudflare/workers-types` or generated types, `@cloudflare/vitest-pool-workers`) is upgraded together.
- TypeScript upgrades are reviewed manually (TS7 compatibility of tooling).
- Automated update PRs (Renovate or Dependabot) are configured in roadmap task 021.003.

## Filtering cheat sheet

```bash
pnpm --filter @blixis/kernel test          # one package
pnpm --filter "./modules/**" test          # all modules
pnpm --filter "...@blixis/contracts" build # contracts and everything depending on it
pnpm --filter "@blixis/api..." build       # api and all its dependencies
pnpm -r ls --depth -1                      # list workspace packages
```

## Adding a package

1. Copy the structure described in `docs/conventions/packages.md` (task 001.004).
2. Name it `@blixis/<name>`; `"type": "module"`; root-only `exports`; `sideEffects: false`.
3. Extend `@blixis/tsconfig/library.json` (or `worker.json` for Worker-targeting code).
4. Add it to root `tsconfig.json` references.
5. Run `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test`.
6. Modules: register in `apps/api/src/blixis.config.ts` explicitly (§2.3).

## Versioning of packages

The deployable platform (API + admin) is versioned with repository tags `vX.Y.Z` — see [Release & deployment](../operations/deployment.md). Publishing public npm packages (`@blixis/contracts`, `@blixis/kernel`, `@blixis/content-api`, `@blixis/sdk`, `@blixis/testing`) is planned in roadmap task 018.005.

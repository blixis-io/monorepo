# 0003 — Lint, format, and package-boundary checks

- Status: accepted
- Date: 2026-09-24
- Roadmap task: [001.002](../plans/001-project-foundation/002-record-toolchain-decisions.md)

## Context

[Code standards](../conventions/code-standards.md) require: automated formatting; no deep imports into other packages (§24, §25); no relative imports across package roots; no circular package dependencies (§48 Packages.7); no Node built-ins in Worker/library code; no floating promises; no `console.*`; `@blixis/testing` only in tests; `modules/*` must not depend on `@blixis/cloudflare`. TypeScript 7 has no JavaScript compiler API, so tools built on it cannot be used.

Spike (2026-09-24):

| Check | Result |
|---|---|
| `typescript-eslint@8.70.1` | peer `typescript >=4.8.4 <6.1.0` → **incompatible with TS 7**; ESLint cannot parse TypeScript without it |
| `@biomejs/biome@2.5.14` | formatter + linter, no TS compiler dependency; `check` runs in ≈ 10 ms on the spike |
| Biome `style/noRestrictedImports` (patterns) | catches `@s/a/src/internal.ts` deep import ✓ |
| Biome `correctness/noNodejsModules` | catches `import fs from 'node:fs'` ✓ |
| Biome `nursery/noFloatingPromises` | detects un-awaited async call (own type inference, no TS API) ✓ — nursery rule |
| Biome `suspicious/noImportCycles` | file-level cycles within a package; did **not** flag a cross-package cycle that goes through package names/`exports` |
| Relative import escaping a package (`../../a/src/index.ts`) | not reliably expressible as a Biome pattern (depends on depth) ✗ |
| `dependency-cruiser@18.4.0` | runs, but needs a rules config and its TypeScript handling relies on the `typescript` package API; not needed given the checks below |

## Decision

1. **Biome 2.x** is the formatter and linter for TS/JS/JSON (catalog pin). Configuration in root `biome.json`:
   - formatter: 2 spaces, LF, line width 100, single quotes, semicolons as needed (source of truth for style);
   - linter: `recommended` plus `noImportCycles`, `noNodejsModules` (overridden to off for Node-only tooling packages and config files), `noFloatingPromises` (error, accepted despite nursery status; re-evaluate on Biome upgrades), `noConsole` (error outside the future logger), `noNonNullAssertion` (error outside tests), `noExplicitAny` (error);
   - `noRestrictedImports` patterns: `@blixis/*/src/**`, `@blixis/*/dist/**`, `@blixis/*/*` subpaths not in the documented allow-list;
   - organize imports via Biome assist.
2. **Custom boundary checker** in `tooling/boundaries` (small, zero-dependency Node script, run by `pnpm lint`) for what Biome cannot express:
   - relative imports whose resolved path leaves the importing package's root;
   - **workspace package dependency cycles** computed from `package.json` (`dependencies`, `peerDependencies`, `devDependencies` of workspace packages);
   - imports of `@blixis/*` packages not declared in the importer's `package.json`;
   - `@blixis/testing` imported from non-test files;
   - forbidden edges: `modules/*` → `@blixis/cloudflare`; `apps/admin` → anything but `@blixis/sdk` (+ UI libs); `@blixis/contracts` → any runtime dependency.
   Import specifiers are extracted with a conservative parser (static `import`/`export … from`/dynamic `import()`); the checker has its own unit tests.
3. **Commit messages:** optional local `commit-msg` hook via lefthook + commitlint (`@commitlint/config-conventional`, scopes from [commit messages](../conventions/commit-messages.md)); CI PR-title check is authoritative (001.007).
4. **Markdown** is not linted in MVP (formatting of docs stays manual); link checking is added in 022.003.

## Alternatives considered

- **ESLint + typescript-eslint + Prettier** — typescript-eslint does not support TS 7; without it ESLint cannot parse TS. Rejected.
- **oxlint** — fast and TS-API-free, but Biome already covers formatting + linting in one tool; revisit only if a needed rule exists only in oxlint.
- **dependency-cruiser** — capable, but adds a large config surface and depends on the `typescript` JS API for TS parsing; our checks are simple graph rules.
- **Nx/Turborepo module boundary rules** — would introduce a task runner we do not otherwise need (see [Monorepo](../development/monorepo.md)).

## Consequences

- One fast tool for formatting/linting; no type-aware lint rules beyond Biome's own inference (acceptable: `tsc` strict mode carries type safety).
- The custom checker is project code that must be maintained and tested; keep it small.
- `noFloatingPromises` is a nursery rule and could change; pin Biome in the catalog and review its changelog on upgrades.
- Tasks 001.005 (configuration + checker) and 001.007 (CI + PR title) implement this ADR.

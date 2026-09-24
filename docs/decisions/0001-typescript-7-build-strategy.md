# 0001 — TypeScript 7 compile and emit strategy

- Status: accepted
- Date: 2026-09-24
- Roadmap task: [001.002](../plans/001-project-foundation/002-record-toolchain-decisions.md)

## Context

The architecture fixes TypeScript 7 (§37), strict ESM, `@blixis/*` packages with root-only `exports` (§24), and Worker bundles built by Wrangler (§12). We need to decide how packages are type-checked and built, which module settings to use, and how workspace packages consume each other.

Spike (2026-09-24, scratch workspace with two library packages, one Worker app):

| Check | Result |
|---|---|
| `typescript@7.0.2` (stable, `latest` tag) | installs as the native compiler; `tsc --version` → `Version 7.0.2` |
| `tsc -b` with project references, `composite`, `declaration`, `declarationMap` | works; `.js`, `.d.ts`, maps emitted; full build ≈ 0.2 s |
| `module`/`moduleResolution: nodenext` + `.ts` import specifiers + `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` | emits `./internal.js` specifiers; built packages import cleanly from plain Node 24 ESM |
| Root-only `exports` | deep imports fail in Node with `ERR_PACKAGE_PATH_NOT_EXPORTED` |
| Wrangler 4.137 bundling a Worker that imports a built workspace package | `wrangler deploy --dry-run` succeeds |
| Vitest 4.1 (Node and Workers pools) importing built workspace packages | passes |
| `wrangler types` output type-checked by TS 7 (`noEmit`) | passes |
| Test files inside `src/` included in a build tsconfig | emitted into `dist/` → must be excluded from build configs |

TypeScript 7 does not expose the classic JavaScript compiler API. This rules out tooling that depends on it (see ADR 0003) and d.ts bundlers built on it; `tsc` itself is not affected.

## Decision

1. **Compiler:** `typescript` 7.x from the pnpm catalog is the only compiler. `tsc` does all type checking and all library emit. No separate bundler (tsdown, tsup, Rollup) for libraries.
2. **Build mode:** every library package is a TS project with `composite: true`, `declaration: true`, `declarationMap: true`, `sourceMap: true`, `rootDir: src`, `outDir: dist`. The root `tsconfig.json` contains only `references`. `pnpm typecheck` / `pnpm build` run `tsc -b` from the root.
3. **Module settings:** `module: "nodenext"`, `moduleResolution: "nodenext"`, `target: "es2022"` (or newer), `lib: ["es2023"]` (no DOM), `types: []` by default. Relative imports are written with the **`.ts` extension** (`import { x } from './x.ts'`) using `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`, so emitted JavaScript has correct `.js` specifiers for Node, bundlers, and Workers alike. This replaces the `moduleResolution: "Bundler"` example in §37, because published libraries (`@blixis/contracts`, `@blixis/kernel`, `@blixis/sdk`) must also run unbundled in Node-based tooling and third-party projects.
4. **Workspace consumption: built `dist/`.** Packages depend on each other via `workspace:*` and resolve the same `exports` map external consumers use (`types` → `dist/index.d.ts`, `default` → `dist/index.js`). No custom `source` export condition. `tsc -b` builds references in dependency order and is fast enough (sub-second for the spike) that build-before-test is acceptable. Dev loop: `tsc -b --watch` alongside tests/dev server.
5. **Tests are not emitted:** build tsconfigs exclude `**/*.test.ts`, `**/*.test-d.ts`, `**/*.worker.test.ts`. Tests are type-checked by a per-package `tsconfig.test.json` (`noEmit`, includes `src` and `test`), run by `pnpm typecheck` after the build.
6. **Apps** (`apps/api`, later `apps/admin`, `apps/example-site`) are not built by `tsc`: they are type-checked with `noEmit` and bundled by their own tool (Wrangler for `apps/api`). `apps/api` includes the `wrangler types` output via its tsconfig.
7. **Strictness baseline** (shared `@blixis/tsconfig` presets, task 001.003): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `isolatedModules`, `noImplicitOverride`, `noFallthroughCasesInSwitch`, `skipLibCheck: true` (third-party declarations only; our own `.d.ts` are produced by `tsc`).

## Alternatives considered

- **`moduleResolution: bundler` with extensionless imports** — rejected: emitted JS is not valid Node ESM, which breaks published packages and Node-based tooling (migration CLI, smoke scripts).
- **`.js` extensions in TS source** — works, but writing `.ts` and rewriting is clearer and matches what editors resolve; rejected in favour of rewrite.
- **Consume `src` via a custom `source` export condition** — avoids a build step, but needs the condition configured in TS, Vitest, Wrangler/esbuild, and Astro, and risks leaking `src` paths into published packages; rejected while `tsc -b` stays fast.
- **tsdown/tsup/Rollup for libraries** — extra tool; d.ts bundling historically relies on the TS JS API; not needed for ESM libraries that ship per-file output.
- **TS 6 for emit + TS 7 for checking** — not needed: TS 7.0.2 emits declarations correctly.

## Consequences

- One compiler, one config family, fast builds; `dist/` is always what gets tested and bundled, so "works in the workspace but not when published" is less likely.
- Every relative import in source must carry `.ts`; enforced by the compiler (`nodenext` requires extensions) — no lint rule needed.
- Tests of a package that imports another workspace package require that dependency to be built first; `pnpm test` runs `tsc -b` first (wired in 001.006).
- `@blixis/tsconfig` presets (001.003) implement points 2, 3, 5, and 7; `docs/conventions/packages.md` (001.004) documents the package template.
- Revisit if build times grow noticeably (then consider the `source` condition) or if TS 7 changes emit behaviour.

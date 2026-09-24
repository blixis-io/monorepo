# 001.003 — Configure root TypeScript 7 setup

## Status

```text
completed
```

## Parent plan

[001 — Project Foundation](./_index.md)

## Objective

Create the shared TypeScript configuration every package extends, plus the root project-reference configuration used by `pnpm typecheck`, following ADR 0001.

## Background

§37 prescribes strict TypeScript 7 with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, and bundler resolution. Centralising this in one base config prevents per-package drift. Workers-specific types (`@cloudflare/workers-types` or generated runtime types) are *not* part of the base config; only Worker-targeting packages add them (plan 004).

## Requirements

- Add `typescript` (TS7, version per ADR 0001) as a root devDependency.
- Create `tooling/tsconfig/` as a private workspace package (e.g. `@blixis/tsconfig`) holding:
  - `base.json` — strict baseline shared by all packages;
  - `library.json` — extends base, enables declaration emit/composite settings for publishable packages;
  - `worker.json` — extends base, placeholder for Worker packages (lib `ES2022`+, no DOM, types added in plan 004).
- Baseline must include at least: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `module`/`moduleResolution: "nodenext"`, `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` (ADR 0001), `target` ES2022+, `isolatedModules`, `skipLibCheck` decision documented, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
- Create root `tsconfig.json` that only contains `references` to packages (initially empty `files: []`), used by `pnpm typecheck` in build mode.
- Wire root `typecheck` script to the TS7 CLI in build mode (`tsc -b` or TS7 equivalent).

## Architectural constraints

- TypeScript 7 only (§48 Code.1).
- Do not add DOM lib to the base config (Workers and libraries must not accidentally depend on browser globals); the admin app adds DOM itself (plan 019).
- No path aliases that bypass package `exports` (aliases would defeat boundary enforcement).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
tooling/tsconfig/package.json
tooling/tsconfig/base.json
tooling/tsconfig/library.json
tooling/tsconfig/worker.json
tooling/tsconfig/test.json
tooling/tsconfig/tsconfig.json
tooling/tsconfig/check/strictness.ts
tooling/tsconfig/check/types.ts
tsconfig.json
```

### Modify

```text
package.json
pnpm-workspace.yaml (catalog: typescript 7.0.2)
pnpm-lock.yaml
docs/ROADMAP.md
docs/plans/001-project-foundation/_index.md
docs/plans/001-project-foundation/003-configure-typescript.md
```

### Delete

```text
None.
```

## Proposed structure

```text
tooling/
└── tsconfig/
    ├── package.json      # @blixis/tsconfig (private)
    ├── base.json
    ├── library.json
    └── worker.json
tsconfig.json             # references only
```

## Implementation steps

1. Add TS7 to root devDependencies at the version fixed in ADR 0001.
2. Create `tooling/tsconfig` package with `"private": true` and the three config files.
3. Create the root `tsconfig.json` with `files: []` and an empty `references` array.
4. Point the root `typecheck` script at the TS7 CLI in build mode.
5. Run `pnpm install` and `pnpm typecheck`.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```jsonc
// tooling/tsconfig/base.json (sketch)
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "moduleResolution": "nodenext",
    "module": "nodenext",
    "allowImportingTsExtensions": true,
    "rewriteRelativeImportExtensions": true,
    "target": "ES2022",
    "isolatedModules": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

## Dependencies

Requires:

- [001.002 — Record toolchain decisions for TypeScript 7, build, test, and lint](./002-record-toolchain-decisions.md)

## Acceptance criteria

- [x] `pnpm typecheck` exits 0 with zero referenced packages.
- [x] `base.json` contains every flag listed in the requirements (or a Technical note explains a TS7-specific replacement).
- [x] No `paths` aliases exist in any tsconfig.
- [x] The TS version reported by `pnpm exec tsc --version` (or TS7 CLI equivalent) is 7.x.

## Validation

```bash
pnpm install
pnpm exec tsc --version
pnpm typecheck
```

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] Every compiler flag deviation from §37 is justified in Technical notes.

## Completion conditions

Change the status to `completed` only when all of the following hold:

1. Implementation is finished and every requirement above is met.
2. Every acceptance criterion is checked.
3. All validation steps pass.
4. The task has passed through `review` and every review checklist item is checked.
5. `Technical notes` are updated with findings from implementation, testing, and review.
6. `Files and folders` reflects the actual change set.
7. The task checkbox and status are updated in [`docs/ROADMAP.md`](../../ROADMAP.md).
8. The parent [`_index.md`](./_index.md) task list, progress count, and plan status are updated (plan becomes `completed` only when all tasks are completed and the plan completion criteria hold).

## Technical notes

- **Presets** (`@blixis/tsconfig`, private): `base.json` (all strict flags + ADR 0001 module settings), `library.json` (composite, declarations, maps, `src` → `dist`, tests excluded), `worker.json` (composite + `noEmit` for Wrangler-bundled apps), and an extra **`test.json`** (composite + `noEmit`, includes `*.test.ts`, `*.test-d.ts`, `*.worker.test.ts`, `test/`) — added now because ADR 0001 requires test files to be type-checked separately from the build.
- Presets use TS's **`${configDir}`** template so `include`/`rootDir`/`outDir` resolve relative to the extending package; verified with TS 7.0.2 using a temporary package (removed again).
- Flags beyond the task minimum: `noImplicitReturns`, `noPropertyAccessFromIndexSignature`, `useUnknownInCatchVariables`, `forceConsistentCasingInFileNames`, `moduleDetection: force`, `resolveJsonModule`. `lib: ["es2023"]`, `types: []` (packages opt into e.g. Workers types explicitly).
- **`skipLibCheck: true`** — only skips third-party `.d.ts`; our own declarations are produced and checked by `tsc`. Revisit if a dependency ships broken types we rely on.
- **TS7 rejects an empty solution** (`files: []` with no references → `TS18002`). The preset package therefore has its own tiny check project (`tooling/tsconfig/check/`) referenced from the root, so `pnpm typecheck` is meaningful from day one: it proves the base preset compiles strict code with `.ts` specifiers.
- **`noEmit` + `composite` works under `tsc -b` in TS7** (writes only `.tsbuildinfo`, git-ignored) — apps and test projects can be referenced from the root solution.
- **Test preset sets `rewriteRelativeImportExtensions: false`:** with rewrite on, a test project importing `./index.ts` from its referenced build project fails with `TS2878` ("unsafe to rewrite … resolves to another project"). Test projects never emit, so rewriting is irrelevant there. Per-package pattern: `tsconfig.json` extends `library.json`; `tsconfig.test.json` extends `test.json` and references `./tsconfig.json`.
- Verified violations are caught: `exactOptionalPropertyTypes` (TS2375), `noUncheckedIndexedAccess` (TS2322).
- Root `typecheck` script is now `tsc -b`; `typescript` comes from the pnpm catalog (`7.0.2`).

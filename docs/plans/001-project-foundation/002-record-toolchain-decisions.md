# 001.002 — Record toolchain decisions for TypeScript 7, build, test, and lint

## Status

```text
completed
```

## Parent plan

[001 — Project Foundation](./_index.md)

## Objective

Decide and document — as accepted ADRs — how packages are type-checked and built with TypeScript 7, how workspace packages consume each other (source vs. `dist`), which test runner is used (including Workers-runtime testing), and which lint/format and boundary-check tools are used.

## Background

The architecture fixes TypeScript 7 (§37) and requires avoiding tools that depend on unsupported compiler internals. It does not pick a build tool, test runner, or linter. These choices affect every later task, so they are made once, up front, with a short spike to verify each candidate actually works with TS7 and Cloudflare Workers.

This is a decision task: it produces documentation and a throwaway spike, not permanent code.

## Requirements

- Create `docs/decisions/README.md` describing the ADR format (context, decision, consequences, status) and numbering (`0001-...`).
- ADR 0001 — **TypeScript 7 compile & emit strategy**: verify TS7 availability (stable vs. preview), confirm declaration emit and `tsc -b` project references; decide whether packages are built with `tsc` alone or a bundler; decide source-vs-`dist` consumption inside the workspace.
- ADR 0002 — **Test runner**: evaluate Vitest with `@cloudflare/vitest-pool-workers` for Workers-runtime tests plus plain Node pool for pure unit tests; confirm compatibility with the TS7 setup (Vitest transpiles via esbuild/oxc, so type checking stays separate).
- ADR 0003 — **Lint, format, and boundary checks**: compare Biome vs. ESLint + Prettier (note that type-aware typescript-eslint rules depend on the TS compiler API); choose a mechanism for forbidding deep imports and dependency cycles (e.g. lint rule, `dependency-cruiser`, or a small custom script over `package.json` graphs).
- Each ADR lists rejected alternatives with one-line reasons.
- Run a throwaway spike in the scratch area (not committed) proving: TS7 type-check of a two-package workspace, declaration emit, one Vitest test in the Workers pool.
- Record spike findings in each ADR's context section.

## Architectural constraints

- Prefer tools with no dependency on the TypeScript JS compiler API (§37: avoid libraries depending on unsupported/deprecated compiler internals).
- Tooling that runs only in development may use Node; nothing chosen here may force Node-only code into Worker bundles.
- Keep the toolchain minimal (§38 dependency questions apply to dev tooling too).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/README.md
docs/decisions/0001-typescript-7-build-strategy.md
docs/decisions/0002-test-runner.md
docs/decisions/0003-lint-format-and-boundaries.md
```

### Modify

```text
pnpm-workspace.yaml (onlyBuiltDependencies → allowBuilds, pnpm 12)
docs/ROADMAP.md
docs/development/monorepo.md
docs/conventions/code-standards.md
docs/plans/001-project-foundation/_index.md
docs/plans/001-project-foundation/001-initialize-pnpm-workspace.md (technical note)
docs/plans/001-project-foundation/002-record-toolchain-decisions.md
docs/plans/001-project-foundation/003-configure-typescript.md (module settings per ADR 0001)
```

### Delete

```text
None.
```

## Implementation steps

1. Check the current TypeScript 7 release status and the official migration notes (native compiler, API availability, emit support).
2. In a scratch directory outside the repo, create a minimal two-package pnpm workspace and verify `tsc -b` with TS7 including `.d.ts` emit.
3. Add Vitest and `@cloudflare/vitest-pool-workers` to the spike; run one test inside the Workers runtime.
4. Try Biome and ESLint(+typescript-eslint) against the spike; note which rules require the compiler API.
5. Evaluate the deep-import/cycle mechanism against the spike (introduce a deep import and a cycle; confirm detection).
6. Write ADRs 0001–0003 with status `accepted`, including versions tested.
7. Update Technical notes with anything surprising (e.g. TS7 flags renamed or removed).

## Dependencies

Requires:

- [001.001 — Initialize pnpm workspace and repository](./001-initialize-pnpm-workspace.md)

## Acceptance criteria

- [x] Three ADRs exist, each with status `accepted`, alternatives considered, and the tool versions verified.
- [x] ADR 0001 states explicitly: build tool, declaration emit mechanism, and whether workspace consumers resolve `src` or `dist`.
- [x] ADR 0002 states how Workers-runtime tests and pure unit tests are separated.
- [x] ADR 0003 names the concrete mechanism that blocks deep imports and cycles.
- [x] No spike code is committed to the repository.

## Validation

- Review the three ADRs against the acceptance criteria.
- `git status` shows only the `docs/decisions/` files as new.

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] Each decision is justified against architecture §37/§38, not preference alone.
- [x] Fallback path documented if TS7 is not yet usable for emit.

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

- **Spike location:** a throwaway workspace in the session scratch directory (not committed). Two library packages (`a` ← `b`), one Worker app, root Vitest config.
- **TypeScript 7.0.2** is the stable `latest` release. `tsc -b` with project references and declaration emit works; full spike build ≈ 0.2 s. No JS compiler API → rules out typescript-eslint (peer `typescript <6.1.0`) and API-based d.ts bundlers.
- **`nodenext` + `.ts` import specifiers** with `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` emit `.js` specifiers; built packages import from plain Node 24 ESM; deep imports fail with `ERR_PACKAGE_PATH_NOT_EXPORTED`. This deliberately replaces the `moduleResolution: "Bundler"` example in architecture §37 (reason in ADR 0001).
- **Tests inside `src/` leak into `dist/`** unless build tsconfigs exclude them → separate `tsconfig.test.json` per package (ADR 0001 §5).
- **Vitest 5.0.1 is latest, but `@cloudflare/vitest-pool-workers@0.22.0` peers on `vitest ^4.1.0`** → pin Vitest 4.1.x. The pool's new API is a Vite plugin: `plugins: [cloudflareTest({ wrangler: { configPath } })]`; Worker tests use `import { exports } from 'cloudflare:workers'`.
- **The pool bundles its own `workerd`** (Miniflare `5.20260815.0-alpha`): a `compatibility_date` of 2026-09-01 failed ("newest date supported … 2026-08-22"); 2026-08-15 passed. Rule: `compatibility_date` ≤ pool runtime; bump Wrangler, pool, and date together (ADR 0002).
- **Wrangler 4.137** bundled a Worker importing a built workspace package (`--dry-run` OK); `wrangler types` output type-checks under TS 7.
- **Biome 2.5.14** caught deep imports (`noRestrictedImports`), `node:fs` (`noNodejsModules`), and floating promises (`nursery/noFloatingPromises`). It did **not** catch relative imports escaping a package or cross-package cycles → small custom checker in `tooling/boundaries` (ADR 0003, implemented in 001.005).
- **dependency-cruiser 18.4** ran but needs a rules config and relies on the `typescript` package API for TS parsing; not adopted.
- **pnpm 12 changes found during the spike:** `onlyBuiltDependencies` is replaced by the `allowBuilds` map (fixed in `pnpm-workspace.yaml` in this PR; note added to 001.001); `pnpm approve-builds <pkg> -y` writes it. pnpm 12 also applies a minimum release age to freshly published versions and records exceptions in `minimumReleaseAgeExclude` (seen for `wrangler@4.137.0`).
- ROADMAP decision D1 marked resolved; docs (`monorepo.md`, `code-standards.md`) and task 001.003 updated to the ADRs.

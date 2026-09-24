# 001.005 — Configure linting, formatting, and package-boundary checks

## Status

```text
completed
```

## Parent plan

[001 — Project Foundation](./_index.md)

## Objective

Install and configure the lint/format tooling and the boundary checker chosen in ADR 0003 so that style issues, deep imports, relative cross-package imports, and package dependency cycles fail `pnpm lint`.

## Background

Architecture rules §2.5, §24, §25, and §48 (no internal imports, no cycles, public exports only) are only useful if a machine enforces them. `exports` maps block deep imports at resolution time, but relative `../../packages/x/src` imports and cycles need an explicit check.

## Requirements

- Install the lint/format tool(s) from ADR 0003 as root devDependencies and add configuration at the root.
- `pnpm lint` runs lint + boundary checks across the workspace; `pnpm format` formats; `pnpm format:check` verifies formatting (for CI).
- Boundary checks must reject:
  - imports of `@blixis/<pkg>/src/...` or any non-exported subpath;
  - relative imports that escape a package root;
  - circular dependencies between workspace packages (based on `package.json` dependency graph);
  - a `modules/*` package depending on another module's non-public API (covered by the first rule).
- Add a rule/check that no package under `packages/` or `modules/` imports Node built-ins (`node:*`, `fs`, `path`, …) unless the package is explicitly allow-listed as Node-only tooling (document the allow-list location).
- Document how to run and how to extend the checks in `docs/conventions/packages.md`.
- Optional local `commit-msg` hook: commitlint with `@commitlint/config-conventional` and the scopes from `docs/conventions/commit-messages.md`, installed via a lightweight hook manager (e.g. lefthook). CI remains the authoritative check (001.007).
- Configure the formatter/linter to match `docs/conventions/code-standards.md` (e.g. ban `console.*` outside the logger, ban non-null assertions outside tests, ban floating promises if the chosen linter supports it without the TS compiler API).

## Architectural constraints

- Avoid type-aware lint rules that require the TypeScript JS compiler API unless ADR 0003 confirms TS7 support.
- Checks must run without building packages first.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
biome.json
commitlint.config.js
lefthook.yml
tooling/tsconfig/node.json
tooling/boundaries/package.json
tooling/boundaries/tsconfig.json
tooling/boundaries/src/cli.ts
tooling/boundaries/src/imports.ts
tooling/boundaries/src/imports.test.ts
tooling/boundaries/src/rules.ts
tooling/boundaries/src/rules.test.ts
tooling/boundaries/src/workspace.ts
```

### Modify

```text
package.json
pnpm-workspace.yaml (catalog + allowBuilds)
pnpm-lock.yaml
tsconfig.json
tooling/tsconfig/package.json
tooling/tsconfig/library.json (Biome formatting)
vitest.config.ts, packages/shared/** (Biome formatting only)
docs/conventions/packages.md
docs/conventions/commit-messages.md
docs/conventions/code-standards.md
docs/development/getting-started.md
docs/ROADMAP.md
docs/plans/001-project-foundation/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Install the chosen tools.
2. Add lint and format configuration; format the existing files once.
3. Implement or configure the boundary checker (deep imports, escaping relative imports, cycles, Node built-ins).
4. Wire `lint`, `format`, `format:check` root scripts.
5. Prove each boundary rule by adding a violating throwaway file/dependency, confirming failure, then reverting.
6. Document usage in the conventions file.

## Dependencies

Requires:

- [001.004 — Define package conventions and create @blixis/shared](./004-define-package-conventions.md)

## Acceptance criteria

- [x] `pnpm lint` and `pnpm format:check` exit 0 on the clean repository.
- [x] A deep import `@blixis/shared/src/assert` causes `pnpm lint` to fail with a message naming the file.
- [x] A relative import escaping a package causes `pnpm lint` to fail.
- [x] An artificial cycle between two packages causes `pnpm lint` to fail.
- [x] An `import 'node:fs'` in `packages/shared` causes `pnpm lint` to fail.

## Validation

```bash
pnpm lint
pnpm format:check
# then, temporarily introduce each violation and re-run pnpm lint (expect non-zero exit), and revert
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
- [x] Each of the four violation types was actually demonstrated and reverted (record in Technical notes).

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

- **Biome 2.5.14** (`biome.json`): `preset: "recommended"` (Biome 2.5 deprecated `"recommended": true`; migrated with `biome migrate --write`), plus `noExplicitAny`, `noConsole`, `noImportCycles`, `noNonNullAssertion`, `useImportType`/`useExportType`, `noNodejsModules`, `nursery/noFloatingPromises` (error), and `noRestrictedImports` patterns for `@blixis/*/src|dist`. Overrides: Node built-ins and `console` allowed in `tooling/**` and `*.config.*`; non-null assertions allowed in tests. VCS integration uses `.gitignore`. Formatter: 2 spaces, LF, width 100, single quotes, semicolons as needed, trailing commas.
- **`tooling/boundaries`** (`@blixis/boundaries`, private, zero runtime deps) runs directly with **Node 24 type stripping** (`node src/cli.ts`) — no build step. Rules: `relative-escape`, `undeclared-workspace-import`, `non-exported-subpath`, `test-only-import` (`@blixis/testing`), `forbidden-edge` (`modules/*` → `@blixis/cloudflare`; `apps/admin` → only `@blixis/sdk`), `workspace-cycle` (package.json graph incl. dev/peer deps), `contracts-runtime-dependency`. 23 unit tests.
- **Import extraction** is regex-based but anchored: static imports/exports must start a statement, dynamic `import('…')` must not follow a quote. The first version flagged `import` text inside string literals of the checker's own test fixtures; fixed and covered by a test.
- **New preset `@blixis/tsconfig/node.json`** for Node-only tooling (`types: ["node"]`, `erasableSyntaxOnly` so Node can strip types, `noEmit`). A test project cannot reference a `noEmit` project (`TS6310`), so Node tooling packages type-check `src` including tests in one project.
- **Violations demonstrated and reverted:** deep import (`noRestrictedImports`), relative escape (checker), `node:fs` in `packages/shared` (`noNodejsModules`), floating promise (`noFloatingPromises`), `console.log` (`noConsole`), workspace cycle `@blixis/boundaries ↔ @blixis/shared` (checker). Biome runs first; the checker runs only if Biome passes.
- **Commit hooks:** commitlint 21.2 (`commitlint.config.js`, scopes from the commit-message conventions; header ≤ 72, body lines ≤ 100) and lefthook 2.1 (`commit-msg`, `pre-commit` Biome on staged files). Verified: `update stuff` and unknown scopes fail; `feat(kernel)!: …` passes. Hooks are opt-in via `pnpm exec lefthook install` (installed locally for the maintainer).
- **pnpm 12 `allowBuilds`:** `lefthook: true` (downloads its binary), `@biomejs/biome: false` (binary comes from optional platform packages).
- Root scripts: `lint` (Biome lint + boundaries), `boundaries`, `format`, `format:check`, `check` (Biome all-in-one).

# 001 — Project Foundation

## Status

```text
in-progress
```

Milestone: Milestone 1 — Workspace & public contracts  
Roadmap scope: MVP / initial platform  
Progress: 1/7 tasks completed

## Objective

Deliver an empty-but-working Blixis monorepo: a pnpm workspace with `apps/`, `packages/`, `modules/`, and `tooling/` locations; a strict TypeScript 7 configuration shared by every package; documented package conventions (naming, ESM, `exports`, build output); lint, format, and package-boundary checks; a test runner that can run both plain unit tests and Workers-runtime tests; and a CI pipeline that runs all of it on every change.

When complete, adding a new `@blixis/*` package is a mechanical, documented operation and every quality gate (install, lint, typecheck, test, build) runs from the repository root with a single command each.

## Why this plan exists

The architecture (§3, §37, §38, §48) prescribes a workspace-based monorepo with `@blixis/*` packages, TypeScript 7, strict typing, ESM, and hard package boundaries enforced through `exports`. Every later plan creates packages; if conventions are decided per package, boundaries drift and the "internal modules load exactly like external packages" rule (§2.2) becomes unenforceable.

This plan also resolves the toolchain questions the architecture leaves open (build tooling for TS7, test runner, lint tool), because TypeScript 7's native compiler changes which JS-API-based tools still work.

## Scope

In scope:

- pnpm workspace and root manifest
- ignore/editor rules (repository already exists on GitHub with a docs bootstrap commit)
- toolchain decision record (TS7 build/emit, test runner, lint/format)
- root and shared TypeScript configuration
- package conventions and the first proving package `@blixis/shared`
- lint, format, and package-boundary checks
- test runner configuration (unit + Workers pool)
- CI pipeline for lint/typecheck/test/build

Out of scope:

- any Blixis contracts, kernel, or module code (plans 002+)
- Cloudflare Worker applications and `wrangler` configuration (plan 004)
- database tooling (plan 005)
- deployment pipelines (plan 021)
- package publishing to npm (018.005)

## Dependencies

Depends on:

- None

## Architecture decisions

- **Workspace**: pnpm workspaces (§3). Workspace globs: `apps/*`, `packages/*`, `modules/*`, `tooling/*`. Example third-party plugins live outside the workspace globs (see plan 018).
- **Namespace**: every first-party package is `@blixis/<name>` (§48 Packages.1).
- **ESM only**: `"type": "module"` everywhere; no CommonJS output (§37).
- **TypeScript 7**: strict mode, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `moduleResolution: "Bundler"` as the baseline (§37), adjusted to what TS7 actually supports.
- **Boundaries through `exports`**: each package exposes only its root entry (plus explicitly documented subpaths). Deep imports such as `@blixis/kernel/src/...` must fail at resolution time and in lint (§24, §25).
- **No circular package dependencies** (§48 Packages.7) — enforced by tooling, not convention.
- **Dependency hygiene**: every dependency must be ESM-friendly and Workers-compatible when it ends up in a Worker bundle (§38). Dev-only tooling may use Node.
- Toolchain choices are recorded as ADRs under `docs/decisions/` by task 001.002 so later tasks can reference them.
- **Workflow conventions are already documented** and must be followed from the first commit: GitHub Flow and Conventional Commits (`docs/conventions/git-workflow.md`, `docs/conventions/commit-messages.md`), code standards (`docs/conventions/code-standards.md`), testing (`docs/conventions/testing.md`), monorepo layout (`docs/development/monorepo.md`).

## Deliverables

- `pnpm install` succeeds from a clean clone with the pinned pnpm and Node versions.
- Root scripts `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format` exist and succeed.
- `docs/decisions/` contains accepted ADRs for TS7 build strategy, test runner, and lint/format tooling.
- `docs/conventions/packages.md` documents how to create a package.
- `packages/shared` (`@blixis/shared`) builds, is type-checked, linted, and has at least one passing unit test.
- A boundary check fails when a package deep-imports another package's internals or when a dependency cycle is introduced.
- CI runs all gates on every push and pull request.

## Tasks

- [x] [001 — Initialize pnpm workspace and repository](./001-initialize-pnpm-workspace.md)
- [ ] [002 — Record toolchain decisions for TypeScript 7, build, test, and lint](./002-record-toolchain-decisions.md)
- [ ] [003 — Configure root TypeScript 7 setup](./003-configure-typescript.md)
- [ ] [004 — Define package conventions and create @blixis/shared](./004-define-package-conventions.md)
- [ ] [005 — Configure linting, formatting, and package-boundary checks](./005-configure-lint-format-and-boundaries.md)
- [ ] [006 — Configure the test runner for unit and Workers-runtime tests](./006-configure-test-runner.md)
- [ ] [007 — Set up the continuous integration pipeline](./007-setup-ci-pipeline.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks in this plan are `completed`.
- [ ] A clean clone passes `pnpm install && pnpm lint && pnpm typecheck && pnpm test && pnpm build` locally and in CI.
- [ ] A deliberately introduced deep import and a deliberately introduced dependency cycle are each rejected by the tooling (verified once, then reverted).
- [ ] ADRs for all toolchain decisions exist with status `accepted`.

## Risks

- **TypeScript 7 tooling gaps**: the native compiler does not expose the classic JS compiler API; tools depending on it (type-aware ESLint rules, API extractors, some d.ts bundlers, `ts-morph`) may not work or may lag. Mitigation: task 001.002 verifies each tool against TS7 before adoption and prefers tools with no compiler-API dependency.
- **Over-configured tooling**: too many tools slow every later task. Keep the toolchain minimal and justify each tool in the ADR.
- **Source vs. built consumption inside the workspace**: consuming `dist/` requires build-before-typecheck ordering; consuming `src/` via a custom export condition can leak into published packages. The ADR must pick one and document it.

## Open questions

- Is TypeScript 7 stable (not preview) at implementation time, and does it support declaration emit and project references (`tsc -b`) for all packages? If not, what is the fallback (e.g. TS 6 for emit, TS7 for type checking)?
- ~~Which CI provider?~~ Resolved 2026-09-24: GitHub Actions on `blixis-io/monorepo` (see `docs/operations/github-actions.md`).

## Technical notes

No technical notes yet.

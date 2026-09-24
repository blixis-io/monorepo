# 001.002 — Record toolchain decisions for TypeScript 7, build, test, and lint

## Status

```text
not-started
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
None.
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

- [ ] Three ADRs exist, each with status `accepted`, alternatives considered, and the tool versions verified.
- [ ] ADR 0001 states explicitly: build tool, declaration emit mechanism, and whether workspace consumers resolve `src` or `dist`.
- [ ] ADR 0002 states how Workers-runtime tests and pure unit tests are separated.
- [ ] ADR 0003 names the concrete mechanism that blocks deep imports and cycles.
- [ ] No spike code is committed to the repository.

## Validation

- Review the three ADRs against the acceptance criteria.
- `git status` shows only the `docs/decisions/` files as new.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Each decision is justified against architecture §37/§38, not preference alone.
- [ ] Fallback path documented if TS7 is not yet usable for emit.

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

No technical notes yet.

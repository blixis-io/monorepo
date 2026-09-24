# 001.003 — Configure root TypeScript 7 setup

## Status

```text
not-started
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
tsconfig.json
```

### Modify

```text
package.json
pnpm-lock.yaml
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

- [ ] `pnpm typecheck` exits 0 with zero referenced packages.
- [ ] `base.json` contains every flag listed in the requirements (or a Technical note explains a TS7-specific replacement).
- [ ] No `paths` aliases exist in any tsconfig.
- [ ] The TS version reported by `pnpm exec tsc --version` (or TS7 CLI equivalent) is 7.x.

## Validation

```bash
pnpm install
pnpm exec tsc --version
pnpm typecheck
```

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Every compiler flag deviation from §37 is justified in Technical notes.

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

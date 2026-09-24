# 023.002 — Generate the API reference from TSDoc

## Status

```text
completed
```

## Parent plan

[023 — Developer Documentation Site](./_index.md)

## Objective

Generate the `@blixis/contracts` API reference during the docs build with TypeDoc (via `starlight-typedoc`), using an isolated TypeScript 6 for the generator, and record the choice as ADR 0018.

## Background

All contracts exports carry TSDoc (002.002 review). TypeDoc is the de-facto generator but supports TypeScript ≤ 6.0; our packages use TypeScript 7.

## Requirements

- ADR 0018: generator choice, TS 6 isolation, fallback options.
- `apps/docs` devDependencies: `typedoc`, `typedoc-plugin-markdown`, `starlight-typedoc`, and `typescript` 6.0.x (local to the app, not the catalog default).
- Configure `starlight-typedoc` for `packages/contracts/src/index.ts` with the package's tsconfig; output under `api/contracts/`; sidebar group generated.
- Generated files are ignored by Git and Biome.
- Build fails on TypeDoc errors; warnings for missing docs are reviewed.

## Architectural constraints

- TypeScript 6 must not be resolvable from library packages (only `apps/docs` depends on it).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0018-api-reference-generator.md
```

### Modify

```text
apps/docs/package.json (typedoc, typedoc-plugin-markdown, starlight-typedoc, typescript 6.0.3)
apps/docs/astro.config.mjs
.gitignore (generated reference)
docs/decisions/README.md
pnpm-lock.yaml
docs/ROADMAP.md
docs/plans/023-developer-documentation-site/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Add generator dependencies to `apps/docs`.
2. Configure `starlight-typedoc` and sidebar.
3. Build; fix TypeDoc warnings in contracts TSDoc if needed.
4. Write ADR 0018.

## Dependencies

Requires:

- [023.001 — Scaffold the Starlight documentation site](./001-scaffold-docs-site.md)

## Acceptance criteria

- [x] The built site contains reference pages for every public export of `@blixis/contracts`.
- [x] `pnpm typecheck` at the root still uses TypeScript 7 (`tsc --version`).
- [x] Removing an export's TSDoc changes the generated page (verified once, reverted).

## Validation

```bash
pnpm --filter @blixis/docs build
pnpm exec tsc --version
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
- [x] ADR 0018 lists the fallback if TypeDoc cannot parse future sources.

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

- **Generator:** TypeDoc 0.28.20 + typedoc-plugin-markdown 4.13.1 via starlight-typedoc 0.23.1, configured in `astro.config.mjs` (`entryPoints: packages/contracts/src/index.ts`, package tsconfig, output `api/contracts`, `excludeInternal`/`excludePrivate`, sort by kind then name). Sidebar: *API reference → @blixis/contracts* via `typeDocSidebarGroup`.
- **TypeScript isolation verified:** TypeDoc resolves `typescript` 6.0.3 from `apps/docs`; the root still uses 7.0.2 (`tsc --version`). TS 6 parsed the TS 7-configured sources without warnings.
- **Coverage:** 9 classes, 15 functions, 3 variables, 40 interfaces, 18 type aliases, plus the `StandardSchemaV1` namespace — matches the 27 runtime exports and all type exports.
- **Drift check:** removing the TSDoc of `isCapabilityId` removed the text from the generated page on the next build; restoring it brought it back.
- `@internal` members (e.g. the service token phantom field) are excluded via `excludeInternal`.
- Generated Markdown (`apps/docs/src/content/docs/api/`) is git-ignored; Biome does not lint Markdown, so no Biome change was needed (task listed `biome.json`).
- ADR numbered **0018** because 0005–0017 are reserved by roadmap tasks; the decisions index notes the reservation.

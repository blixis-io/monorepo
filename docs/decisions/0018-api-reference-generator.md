# 0018 — API reference generator

- Status: accepted
- Date: 2026-09-24
- Roadmap task: [023.002](../plans/023-developer-documentation-site/002-generate-api-reference.md)

> Numbering: ADRs 0006–0017 are reserved by earlier roadmap tasks (see the ROADMAP decision register), so this decision takes the next free number.

## Context

The developer documentation site (plan 023) needs an API reference that is generated from TSDoc so it never drifts from the code. All `@blixis/contracts` exports carry TSDoc (002.002). The packages are compiled with TypeScript 7, which has no JavaScript compiler API ([ADR 0001](./0001-typescript-7-build-strategy.md)).

Findings (2026-09-24):

| Tool | Version | TypeScript support |
|---|---|---|
| TypeDoc | 0.28.20 | peer `typescript` 5.0–**6.0** (compiler API) |
| typedoc-plugin-markdown | 4.13.1 | via TypeDoc |
| starlight-typedoc | 0.23.1 | Starlight ≥ 0.39, Astro ≥ 6, TypeDoc ≥ 0.28 |
| API Extractor / other TS-API tools | — | same limitation (compiler API) |

Spike: TypeDoc with **TypeScript 6.0.3** reads the TS 7 sources of `@blixis/contracts` (including `.ts` import specifiers, `rewriteRelativeImportExtensions`, `${configDir}` presets) without warnings and generates pages for all 9 classes, 15 functions, 3 constants, and every interface/type alias.

## Decision

1. Generate the reference with **TypeDoc + typedoc-plugin-markdown via starlight-typedoc** during the docs build (`apps/docs`).
2. **Isolate TypeScript 6:** `apps/docs` declares `typescript@6.0.3` (exact, not the catalog default) as a devDependency; pnpm resolves TypeDoc's peer from there. Library packages and the root `tsc -b` keep TypeScript 7 from the catalog. TS 6 is used only to *read* sources for documentation; it never type-checks or emits project code.
3. **Generated Markdown is build output** (`apps/docs/src/content/docs/api/`, git-ignored). The reference is always regenerated from the current sources.
4. Entry points are package public entries (`packages/<pkg>/src/index.ts`) with the package tsconfig; add one `starlightTypeDoc` instance per documented package.

## Alternatives considered

- **Hand-written reference** — drifts from the code; rejected.
- **Generate from emitted `.d.ts`** with TypeDoc — also possible with TS 6; source entry points keep source links and TSDoc on implementation files. Kept as fallback.
- **Deno `deno doc`** — works without the TS compiler API, but adds Deno to the toolchain and does not integrate with Starlight.
- **Wait for TS 7-native tooling** — blocks documentation now; revisit when TypeDoc supports TypeScript 7.

## Consequences

- One extra TypeScript version in the lockfile, confined to the docs app.
- If future TS 7-only syntax cannot be parsed by TS 6, the docs build fails in CI. Fallbacks in order: document emitted `.d.ts`; upgrade to a TypeDoc release with TypeScript 7 support; switch generators.
- Remove the isolation (use the catalog TypeScript) once TypeDoc supports TypeScript 7.

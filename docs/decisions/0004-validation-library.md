# 0004 — Validation library

- Status: accepted
- Date: 2026-09-24
- Roadmap task: [002.005](../plans/002-public-contracts/005-select-validation-library.md)

## Context

§29 requires validating all untrusted input (REST bodies/params, GraphQL inputs, module configuration, queue messages, webhook payloads, environment) with a library that works on Cloudflare Workers and TypeScript 7, and deriving types from schemas instead of duplicating them. §4 forbids runtime dependencies in `@blixis/contracts`, and §2.2 requires third-party modules to use the same contracts as first-party ones — so contracts cannot force a library on module authors.

Candidates (versions on 2026-09-24): Zod 4.6.5, Valibot 1.5.0, ArkType 2.2.3. All three implement the [Standard Schema](https://standardschema.dev) interface (`~standard`).

Spike (Zod, in the Workers test pool and a Wrangler dry-run bundle):

| Check | Result |
|---|---|
| `z.object(...).parse` / `safeParse` inside `workerd` | works |
| `schema['~standard'].validate(...)` inside `workerd` | works, returns issues |
| `new Function` in the Vitest Workers pool | **allowed** (production Workers forbid code generation) — tests cannot prove eval-free behaviour |
| Minimal Worker bundle, full `zod` | 769 KiB raw / **119 KiB gzip** |
| Minimal Worker bundle, `zod/mini` | 28 KiB raw / **7 KiB gzip** |
| TypeScript 7 (`tsc -b`) with Zod types | no issues; no compiler-API usage |

## Decision

1. **Zod 4** is the default schema library for first-party Blixis code (chosen by the project owner; meets all §29 criteria). Pinned in the pnpm catalog.
2. **`@blixis/contracts` stays library-agnostic.** It exposes the **Standard Schema v1 interface** (types vendored into `src/standard-schema.ts`, as the spec recommends, so contracts keep zero dependencies) plus `validate` / `validateSync` helpers that run any Standard Schema and throw `ValidationError` with normalised `ValidationIssue`s. Module contracts (`configSchema`, event schemas) are typed as `StandardSchemaV1`, so third-party modules may use Zod, Valibot, ArkType, or anything compliant.
3. **Worker entry points call `z.config({ jitless: true })`** before defining schemas. Production Workers forbid `eval`/`new Function`; Zod detects this and falls back, but the Vitest Workers pool allows eval, so jitless mode keeps tests and production on the same code path.
4. **Bundle size:** full `zod` is the default for developer experience. If Worker startup or bundle budgets (measured from 004.006 onward) become tight, switch hot-path packages to `zod/mini` (same schemas, functional API) — record it in the owning task.
5. **Validation at boundaries only:** routes, resolvers, queue consumers, module config, and env use schemas; services re-check domain invariants. Derive TypeScript types with `z.infer` / `StandardSchemaV1.InferOutput` — no hand-written duplicates.
6. **OpenAPI/JSON Schema:** Zod 4's built-in JSON Schema conversion is the expected basis for OpenAPI generation (ADR 0015 in 017.001) and content-type field validation (010.003).

## Alternatives considered

- **Valibot** — smallest bundles and modular API; rejected as default in favour of Zod's ecosystem (Hono integrations, JSON Schema, familiarity). Remains usable by third-party modules via Standard Schema.
- **ArkType** — excellent inference and speed; heavier type-level machinery (TS 7 check-time risk) and smaller ecosystem.
- **Depending on `@standard-schema/spec` from contracts** — would add a (type-only) dependency that consumers must resolve; vendoring the ~60-line interface is what the spec recommends.

## Consequences

- One mental model for first-party validation; third parties stay free.
- ~119 KiB gzip added to the API Worker once Zod is used there — acceptable, to be tracked with the bundle-size check (004.006).
- Contracts must keep the vendored Standard Schema types in sync with spec v1 (stable; versioned by the spec).

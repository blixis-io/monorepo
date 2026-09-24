# Code Standards

Rules for all TypeScript code in the Blixis monorepo. They make the architecture rules in [`BLIXIS_ARCHITECTURE.md`](../BLIXIS_ARCHITECTURE.md) (§37 TypeScript, §38 dependencies, §48 agent instructions) concrete. Tooling choices (formatter, linter, boundary checker) are fixed by ADR 0003 in roadmap task [001.002](../plans/001-project-foundation/002-record-toolchain-decisions.md); this document defines *what* is enforced.

Related: [Monorepo](../development/monorepo.md) · [Testing](./testing.md) · [Commit messages](./commit-messages.md)

---

## 1. Language and compiler

- **TypeScript 7 only**, strict mode, ESM only (`"type": "module"`).
- Required compiler flags (shared base config in `tooling/tsconfig/base.json`): `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `verbatimModuleSyntax`, `module`/`moduleResolution: "nodenext"` with `.ts` relative import specifiers rewritten on emit ([ADR 0001](../decisions/0001-typescript-7-build-strategy.md)), `isolatedModules`, `noImplicitOverride`, `noFallthroughCasesInSwitch`.
- Target ES2022 or newer. No DOM types outside `apps/admin` and `apps/example-site`.
- No `paths` aliases that bypass package `exports`.

## 2. Types

- **No `any`.** Use `unknown` at untrusted boundaries and narrow after validation. A justified exception needs an inline comment explaining why.
- **No non-null assertions (`!`)** except in tests; use `invariant()` from `@blixis/shared`.
- **No unchecked casts (`as X`)** on data from outside the process (requests, queue messages, DB JSON, env). Validate with a schema instead.
- Prefer `readonly` properties and `readonly T[]` for public contracts.
- Prefer discriminated unions over boolean flags; use `assertNever()` for exhaustive switches.
- Public contracts get explicit return types; internal functions may rely on inference.
- Avoid heavy type-level programming; readable types beat clever types.
- Use `import type` / `export type` for type-only imports (`verbatimModuleSyntax` enforces it).
- Relative imports include the `.ts` extension: `import { x } from './x.ts'`.

## 3. Naming

| Thing | Convention | Example |
|---|---|---|
| Files and folders | kebab-case | `content-type.service.ts`, `entry.repository.ts` |
| Role suffixes | `.service.ts`, `.repository.ts`, `.routes.ts`, `.schema.ts`, `.test.ts`, `.worker.test.ts` | |
| Types, interfaces, classes | PascalCase | `ContentService`, `EntryVersion` |
| Functions, variables | camelCase | `createServiceToken` |
| Service tokens, constants | SCREAMING_SNAKE_CASE | `CONTENT_SERVICE` |
| Event types | `<aggregate>.<past-tense>` | `entry.published` |
| Permission IDs | `<module>.<action>` / `<module>.<resource>.<action>` | `content.entries.publish` |
| Capabilities | `<namespace>.<capability>` | `blixis.assets` |
| Packages | `@blixis/<name>` | `@blixis/content` |
| Database tables/columns | snake_case, plural tables | `entry_versions.created_at` |
| Environment variables/bindings | SCREAMING_SNAKE_CASE | `HYPERDRIVE`, `BLIXIS_ENV` |

No `I` prefix on interfaces, no `Impl` suffix on classes.

## 4. Modules and packages

- Organise by **domain module**, not technical layer (§2.1). Use the §23 layout (`domain/`, `application/`, `infrastructure/`, `rest/`, `graphql/`, `events/`) and create only the folders you need.
- **Public API only via `src/index.ts`** and package `exports`. Never import another package's `src/` or internal files (§2.5, §24). Boundary checks enforce this.
- Cross-module communication only through **service tokens, capabilities, and events** (§2.5).
- **Named exports everywhere**, except the module factory, which is the package's default export (`export { default } from './module.ts'`) so consumers write `import content from '@blixis/content'`.
- No barrel files inside a package other than `src/index.ts`.
- No circular dependencies between packages or between files within a package.
- `@blixis/testing` is imported only from test files.

## 5. Layering rules

- **Route handlers and GraphQL resolvers contain no business logic** (§48 Code.8–9): parse/validate input → call a service → map output.
- **Services are transport-agnostic**: they receive a `RequestContext`, never a Hono `Context` or GraphQL `info`.
- **Repositories** do data access only, always tenant-scoped (§31); they never enforce permissions.
- **Authorization happens in services** via `AUTHORIZATION_SERVICE.require(...)`; no role-name checks anywhere (§30).
- **Cloudflare bindings** are accessed only in adapters (`@blixis/cloudflare`, infrastructure folders); domain code never touches `env` (§19, §48 Architecture.7).

## 6. Errors

- Throw the public error classes from `@blixis/contracts` (`ValidationError`, `NotFoundError`, `ConflictError`, `ForbiddenError`, `UnauthorizedError`, `RateLimitError`, `ModuleError`, `InfrastructureError`) (§28).
- Never throw Hono `HTTPException` from services; transports map errors.
- Translate driver/SDK errors at the infrastructure boundary; never leak internal messages, SQL, or connection details.
- Don't swallow errors. If you catch, either handle meaningfully, rethrow with `cause`, or log and rethrow.

## 7. Validation

- Validate **all untrusted input at the boundary** — request bodies, params, query strings, GraphQL inputs, queue messages, webhook payloads, env, module config (§29).
- Use the project's default schema library (ADR 0004) through the Standard Schema interface; derive types from schemas (`InferOutput`) instead of duplicating interfaces.
- Services re-check domain invariants; schemas check shape.

## 8. Async and Workers runtime

- **No floating promises.** Every promise is awaited, returned, or passed to `ctx.waitUntil` via `waitUntilSafe`.
- No I/O at module top level (Workers forbid I/O in global scope); do it in `boot` hooks or per request.
- Do not share I/O objects (DB clients, streams, responses) across requests; use request-scoped services.
- Prefer Web Platform APIs (`fetch`, `Request`, `Response`, `URL`, `crypto`, streams). No Node built-ins in Worker code; `nodejs_compat` only where ADR 0006 requires it.
- Stream large payloads; never buffer uploads fully in memory.
- Use `AbortSignal.timeout()` for outbound `fetch`.
- No hidden global mutable state (§48 Code.6).

## 9. Logging

- Use the injected `Logger` (`ctx.logger`), never `console.*` in source code.
- Structured fields per §35 (`requestId`, `correlationId`, `spaceId`, `actorId`, `module`, `eventType`, …).
- **Never log** tokens, passwords, secrets, cookies, connection strings, or sensitive personal data.

## 10. Database

- Conventions in `docs/conventions/database.md` (created by roadmap task 005.007): UUIDv7 IDs, `timestamptz`, snake_case, tenant columns, module-owned migrations.
- Migrations are **expand/contract** (backward compatible with the previous deployed version) because staging and production deploy migrations before the Worker.
- One migration per logical change; never edit an applied migration.

## 11. Dependencies

Before adding a dependency answer (§38): why is it needed, can a platform primitive solve it, does it work on Workers, does it support TypeScript 7, what does it cost in bundle size, is it core or module-only? Record the answers in the task's Technical notes.

- Runtime dependencies of Worker packages must be ESM and Workers-compatible.
- Pin shared versions via the pnpm catalog (see [Monorepo](../development/monorepo.md#dependency-versions)).
- Third-party modules use `peerDependencies` on `@blixis/contracts` (§25).

## 12. Formatting and linting

- Formatting and linting use **Biome** ([ADR 0003](../decisions/0003-lint-format-and-boundaries.md)); never hand-format or argue style in review.
- 2-space indentation, LF line endings, UTF-8, final newline (`.editorconfig`).
- Single quotes, semicolons only where needed, line width 100 — `biome.json` is the source of truth.
- `pnpm lint` must pass: Biome rules + the `tooling/boundaries` checker (relative imports escaping a package, workspace cycles, undeclared workspace imports, test-only and forbidden package edges).

## 13. Comments and documentation

- TSDoc on every exported symbol of public packages (`@blixis/contracts`, `@blixis/kernel`, `@blixis/sdk`, `@blixis/content-api`).
- Comments explain *why*, not *what*. No commented-out code.
- `TODO` comments must reference a roadmap task or issue: `// TODO(011.001): replace stub`.
- Update docs in the same PR as the behaviour they describe.

## 14. Security basics

- Hash credentials (passwords with the ADR 0009 KDF; tokens with SHA-256); compare in constant time.
- Always verify tenant ownership of loaded resources; non-members get 404.
- Treat every outbound URL supplied by users as SSRF-sensitive.
- Secrets live in Wrangler secrets / GitHub environment secrets only.

## 15. Review checklist (every PR)

- [ ] Follows these standards; no boundary violations.
- [ ] No `any`, unchecked casts, floating promises, or `console.*`.
- [ ] Input validated at boundaries; errors are public error classes.
- [ ] Tenant scoping and authorization in services.
- [ ] Tests added at the right level (see [Testing](./testing.md)).
- [ ] New dependencies justified.
- [ ] Docs and roadmap task updated.

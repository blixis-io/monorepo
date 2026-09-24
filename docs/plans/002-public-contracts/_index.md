# 002 — Public Contracts

## Status

```text
completed
```

Milestone: Milestone 1 — Workspace & public contracts  
Roadmap scope: MVP / initial platform  
Progress: 8/8 tasks completed

## Objective

Deliver `@blixis/contracts` with the complete initial public contract surface described in architecture §4, §5, §7, §8, §15, §27, §28, §29, and §30. At the end of this plan an external author could write a type-correct module skeleton against `@blixis/contracts` alone (the kernel that runs it arrives in plan 003).

## Why this plan exists

§4 names `@blixis/contracts` as "the primary dependency for external module authors" and demands it stay small and stable. §2.2 requires first-party and third-party modules to use exactly the same contract. Defining these contracts before the kernel forces the kernel to implement *the public contract* instead of the contract being reverse-engineered from kernel internals — which is how extension APIs usually become incomplete (§42 Stage 8 warning).

## Scope

In scope:

- package scaffold for `@blixis/contracts`
- module, metadata, contribution, and lifecycle context types
- service tokens and capability identifiers
- public error classes and error codes
- validation library decision and a library-agnostic schema contract
- event envelope, event definition, and subscription contracts
- actor, permission definition, and authorization service contracts
- request context and migration definition contracts

Out of scope:

- any runtime implementation of registries, event buses, databases, or HTTP handling (plans 003–006)
- domain-specific contracts such as `ContentService` (owned by modules; relocation question handled in plan 018)
- GraphQL server setup (plan 012)

## Dependencies

Depends on:

- [001 — Project Foundation](../001-project-foundation/_index.md)

## Architecture decisions

- `@blixis/contracts` contains types, tokens, small pure helpers (`createServiceToken`, `defineEvent`, error classes), and nothing else (§4 Allowed/Avoid lists).
- **No runtime dependencies** other than, at most, type-only peers. Database clients, Hono instances, Cloudflare bindings, and GraphQL servers are forbidden (§4).
- **Validation is library-agnostic at the contract level**: contracts reference the Standard Schema interface (`StandardSchemaV1`) so modules can use any compliant library; the platform picks one default library for first-party code (task 002.005).
- **Service tokens are typed objects**, not strings (§7). Token identity uses `Symbol.for(name)` so duplicate package instances still resolve the same token.
- **Errors are transport-agnostic** (§28): each error carries a stable machine code; mapping to HTTP/GraphQL happens in transports.
- **Events are serialisable and versioned** with the §15 envelope.
- **Semver discipline**: from the first published version, breaking changes to this package require a major bump (§48 Code.12).

## Deliverables

- `packages/contracts` builds and exports the full contract surface from its root entry only.
- ADR 0004 (validation library) accepted.
- A type-level test file proves a sample third-party module definition compiles against contracts alone.
- Unit tests cover every runtime helper (token creation, error classes, event definition helper).
- `docs/contracts/README.md` gives an overview of the contract surface for module authors.

## Tasks

- [x] [001 — Scaffold the @blixis/contracts package](./001-scaffold-contracts-package.md)
- [x] [002 — Define module, metadata, contribution, and lifecycle contracts](./002-define-module-contracts.md)
- [x] [003 — Define typed service tokens and capability identifiers](./003-define-service-tokens-and-capabilities.md)
- [x] [004 — Define the public error model](./004-define-public-errors.md)
- [x] [005 — Select the validation library and define the schema contract](./005-select-validation-library.md)
- [x] [006 — Define event envelope, definition, and subscription contracts](./006-define-event-contracts.md)
- [x] [007 — Define actor, permission, and authorization contracts](./007-define-permission-and-actor-contracts.md)
- [x] [008 — Define request context and migration contracts](./008-define-request-context-and-migration-contracts.md)

## Completion criteria

The plan may be marked `completed` when:

- [x] All tasks `completed`.
- [x] `@blixis/contracts` has zero runtime `dependencies` (peer/type-only dependencies documented).
- [x] The sample module type test compiles with only `@blixis/contracts` imported.
- [x] Every exported symbol is documented with TSDoc.

## Risks

- **Premature surface growth**: adding speculative contracts makes them hard to change later. Only add what plans 003–012 demonstrably need; mark anything uncertain as `@experimental` in TSDoc.
- **Hono type coupling**: `RestContribution` needs a Hono sub-app type, but §4 forbids Hono instances in contracts. Resolved in 002.002 (type-only peer vs. structural type).
- **Standard Schema drift**: if the Standard Schema spec changes, contracts must follow; vendor the type or depend on `@standard-schema/spec` as types-only.

## Open questions

- Should `RestContribution` reference Hono's `Hono` type via a type-only peer dependency, or a minimal structural interface owned by contracts? (Decided in 002.002; recommendation: type-only peer on `hono` because §9 makes Hono the fixed framework and structural typing would lose route type inference.)
- Should contracts be published to npm from day one or remain workspace-only until plan 018 proves sufficiency? (Default: workspace-only until 021.003.)

## Technical notes

- Completed 2026-09-24 in PRs #10–#17. Execution order 001 → 003 → 004 → 005 → 006 → 007 → 008 → 002, because the module contract (002) references all other contract types; 002 took over 008's final surface review.
- Decisions: Zod 4 for first-party validation with vendored Standard Schema v1 in contracts ([ADR 0004](../../decisions/0004-validation-library.md)); `hono` as a type-only peer with contract-owned `ModuleHonoEnv`; invariant service-token phantom type; `Symbol.for` brands for tokens and errors.
- Runtime surface: 27 exports; zero `dependencies`; every export documented; a full third-party-style module compiles against contracts alone (type test).
- Found along the way: `pnpm lint` now runs `biome check` (import order was only checked by the pre-commit hook); optional class fields use `declare` to avoid `undefined` properties under ES2022 class fields; the Vitest Workers pool permits `eval`, so Worker code sets `z.config({ jitless: true })`.

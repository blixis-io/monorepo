# 018 — Extension Platform & Example Plugin

## Status

```text
not-started
```

Milestone: Milestone 8 — Consumers & extension platform  
Roadmap scope: MVP / initial platform  
Progress: 0/5 tasks completed

## Objective

Make it possible — and continuously verified — for a third-party developer to build, install (`pnpm add`), and register a Blixis module that provides services, REST routes, GraphQL fields, permissions, and event handlers using only public contracts (§2.2, §25, §42 Stage 8, §52).

## Why this plan exists

§42 Stage 8 says: create an example external module outside the monorepo; if it needs internal imports, the extension API is incomplete. §52 requires continuously maintaining such a module. §44 notes that third-party modules importing `CONTENT_SERVICE` from `@blixis/content` couple to a concrete first-party package and suggests moving shared public content capabilities into contracts or a dedicated public API package. §39 demands honest security messaging: npm modules are trusted code.

## Scope

In scope:

- public content capability contract relocation decision and implementation
- module authoring guide and security model documentation
- example plugin `@blixis-example/seo` outside workspace globs
- CI job: pack public packages, install plugin from tarball into a scratch app, build/test Worker, fail on internal imports
- public API surface tracking for contracts/kernel
- versioning (release-please manifest) and npm publishing of public packages

Out of scope:

- runtime enable/disable per tenant (Phase 2, deferred)
- Workers for Platforms / isolated user plugins (Phase 3, deferred)
- plugin marketplace (§47 non-goal)

## Dependencies

Depends on:

- [017 — SDK & Example Astro Consumer](../017-sdk-and-example-consumer/_index.md)

## Architecture decisions

- **Build-time modules only** (§40 Phase 1): `pnpm add` → explicit import → build → deploy.
- **Trusted code** (§39): documentation must state that npm modules run with full Worker permissions and are not sandboxed.
- **Peer dependencies**: plugins peer-depend on `@blixis/contracts` (and `@blixis/kernel` only if using `defineModule`) (§25).
- **Contract sufficiency is a CI gate**, not a one-off demo (§52).

## Deliverables

- ADR 0016 (public capability contracts location) accepted and implemented.
- `docs/extensions/authoring-guide.md`, `docs/extensions/security-model.md`.
- `examples/blixis-example-seo/` plugin with tests.
- CI job `extension-contract` green.
- API surface reports for `@blixis/contracts` and `@blixis/kernel` checked in CI.
- Public packages (`@blixis/contracts`, `@blixis/kernel`, `@blixis/content-api`, `@blixis/sdk`, `@blixis/testing`) publish-ready with release-please manifest entries; first prerelease published or dry-run verified.

## Tasks

- [ ] [001 — Relocate public content capability contracts](./001-public-content-capability-contracts.md)
- [ ] [002 — Write the module authoring guide and security model](./002-authoring-guide-and-security-model.md)
- [ ] [003 — Build the example external SEO plugin](./003-example-external-plugin.md)
- [ ] [004 — Add the extension contract CI gate and API surface reports](./004-extension-contract-ci-gate.md)
- [ ] [005 — Version and publish public packages](./005-package-versioning-and-publishing.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] The example plugin, installed from a tarball, adds an SEO REST route, a GraphQL field on entries, a permission, and an `entry.published` handler — with zero imports outside `@blixis/contracts`, `@blixis/kernel`, and the public content API package.
- [ ] Architectural checkpoint CP7 recorded.

## Risks

- **Contract gaps** discovered late force changes to published contracts; this plan exists to find them before 1.0.
- **Dual package instances** (plugin bundling its own contracts copy) break `Symbol.for` tokens or `instanceof`; brand checks (002.004) and peer deps mitigate — verify in CI.

## Open questions

- Location of public content capabilities: inside `@blixis/contracts` (keeps one dependency but grows it) vs. a new `@blixis/content-api` package (keeps contracts small)? (ADR 0016; recommendation: `@blixis/content-api` types+tokens package, since §4 requires contracts to stay small.)
- Should the example plugin live in a separate Git repository instead of `examples/` outside workspace globs? Default: `examples/` excluded from workspace, consumed via `pnpm pack` tarballs — simulates npm install while keeping CI simple.
- Third-party field types (from 010) — expose now? Decide based on what the SEO plugin needs.
- Is the `@blixis` npm scope owned, and which licence applies? Both must be confirmed by the project owner before 018.005 publishes anything.
- Which first-party modules are published to npm vs. workspace-only? Default: platform packages + SDK now; modules when third parties need them.

## Technical notes

No technical notes yet.

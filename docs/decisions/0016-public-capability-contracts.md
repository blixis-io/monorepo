# 0016 — Public capability contracts: `@blixis/content-api`

- Status: accepted
- Date: 2026-09-28
- Roadmap task: [018.001](../plans/018-extension-platform/001-public-content-capability-contracts.md) (decision register D19)

## Context

Modules use content through `CONTENT_SERVICE`, the content event definitions (`entry.published`, …), and the entry and content type views. Today they all come from `@blixis/content`, the implementation package: a third-party module that reacts to `entry.published` has to depend on the whole content module, with its Drizzle tables, Zod, Hono routes, and GraphQL code (§44). §8 asks modules to depend on capabilities, not on package names, and §25 says plugins depend primarily on contracts.

Options:

- **(a) Move them into `@blixis/contracts`.** One dependency for plugins, but contracts would grow with every first-party module's API, and §4 wants contracts small and domain-free.
- **(b) A public API package per capability**, starting with `@blixis/content-api`: types, service tokens, and event definitions only, depending on `@blixis/contracts` alone. The implementation (`@blixis/content`) implements and re-exports them.
- **(c) Leave them in `@blixis/content`** and document the coupling. Plugins keep the heavy dependency and pin the implementation's version.

## Decision

**Option (b).**

1. **`@blixis/content-api`** (`packages/content-api`) holds what other modules need from content: `CONTENT_SERVICE` / `ContentService`, `CONTENT_TYPE_SERVICE` / `ContentTypeService`, the views (`EntryView`, `EntrySys`, `EntryVersionView`, `ContentTypeView`, `FieldView`, …), the stored `ContentType` shape, the input types, and the eight content event definitions with their payload types.
2. **Its only dependency is `@blixis/contracts`** (a peer dependency, so plugins and the app share one copy, and the `Symbol.for` service tokens and error classes match). Event payload schemas are small dependency-free Standard Schemas instead of Zod, so plugins don't pull in a schema library. A boundary rule enforces it.
3. **Token ids and event types stay the same** (`@blixis/content.entries`, `entry.published`, …): moving is invisible at runtime; stored events and existing subscriptions keep working.
4. **`@blixis/content` implements the API and re-exports it**, so existing imports keep working. Its Zod input schemas are checked against the public input types at compile time (`SameShape`), as the REST operations are (ADR 0015).
5. **First-party modules import capabilities from the API package.** `@blixis/webhooks` imports the content event definitions from `@blixis/content-api`.
6. **The same pattern applies to other capabilities when a consumer needs them.** Asset lookups already live in contracts as ports (`ASSET_LOOKUP`, plan 014.005); asset events stay in `@blixis/assets` until a third-party module needs them, and then get an `@blixis/assets-api`.

Out of scope: field type authoring (`defineFieldType`) stays in `@blixis/content`, because field types are registered through `contentModule({ fieldTypes })` and depend on Zod-based validation (ADR 0010 §4).

## Consequences

- A plugin that reacts to entries depends on `@blixis/contracts`, `@blixis/kernel` (for `defineModule`), and `@blixis/content-api`: a few kilobytes of types, tokens, and schemas.
- Changes to the content service interface or event payloads are public API changes: they are versioned with `@blixis/content-api` (plan 018.005) and show up in its API surface report (018.004).
- One more package to build and publish; the pattern costs a package per capability, so it is used only where consumers exist.

# 0016 — Public capability contracts: `@blixis-io/content-api`

- Status: accepted
- Date: 2026-09-28
- Roadmap task: [018.001](../plans/018-extension-platform/001-public-content-capability-contracts.md) (decision register D19)

## Context

Modules use content through `CONTENT_SERVICE`, the content event definitions (`entry.published`, …), and the entry and content type views. Today they all come from `@blixis-io/content`, the implementation package: a third-party module that reacts to `entry.published` has to depend on the whole content module, with its Drizzle tables, Zod, Hono routes, and GraphQL code (§44). §8 asks modules to depend on capabilities, not on package names, and §25 says plugins depend primarily on contracts.

Options:

- **(a) Move them into `@blixis-io/contracts`.** One dependency for plugins, but contracts would grow with every first-party module's API, and §4 wants contracts small and domain-free.
- **(b) A public API package per capability**, starting with `@blixis-io/content-api`: types, service tokens, and event definitions only, depending on `@blixis-io/contracts` alone. The implementation (`@blixis-io/content`) implements and re-exports them.
- **(c) Leave them in `@blixis-io/content`** and document the coupling. Plugins keep the heavy dependency and pin the implementation's version.

## Decision

**Option (b).**

1. **`@blixis-io/content-api`** (`packages/content-api`) holds what other modules need from content: `CONTENT_SERVICE` / `ContentService`, `CONTENT_TYPE_SERVICE` / `ContentTypeService`, the views (`EntryView`, `EntrySys`, `EntryVersionView`, `ContentTypeView`, `FieldView`, …), the stored `ContentType` shape, the input types, and the eight content event definitions with their payload types.
2. **Its only dependency is `@blixis-io/contracts`** (a peer dependency, so plugins and the app share one copy, and the `Symbol.for` service tokens and error classes match). Event payload schemas are small dependency-free Standard Schemas instead of Zod, so plugins don't pull in a schema library. A boundary rule enforces it.
3. **Token ids and event types stay the same** (`@blixis/content.entries`, `entry.published`, …): moving is invisible at runtime; stored events and existing subscriptions keep working.
4. **`@blixis-io/content` implements the API and re-exports it**, so existing imports keep working. Its Zod input schemas are checked against the public input types at compile time (`SameShape`), as the REST operations are (ADR 0015).
5. **First-party modules import capabilities from the API package.** `@blixis-io/webhooks` imports the content event definitions from `@blixis-io/content-api`.
6. **The same pattern applies to other capabilities when a consumer needs them.** Asset lookups already live in contracts as ports (`ASSET_LOOKUP`, plan 014.005); asset events stay in `@blixis-io/assets` until a third-party module needs them, and then get an `@blixis/assets-api`.

Out of scope: field type authoring (`defineFieldType`) stays in `@blixis-io/content`, because field types are registered through `contentModule({ fieldTypes })` and depend on Zod-based validation (ADR 0010 §4).

## Addendum (018.003): gaps found by the example plugin

Building `examples/blixis-example-seo` against packed tarballs found four gaps, fixed in the contracts rather than worked around in the plugin:

1. **`space.deleted` is public.** Its description obliges every module that stores per-space data to delete it, so third-party modules must be able to subscribe. The definition moved to `@blixis-io/contracts`; `@blixis-io/spaces` emits and re-exports it.
2. **`struct` moved to `@blixis-io/contracts`.** Public event definitions in more than one package need the same dependency-free Standard Schema helper.
3. **`GraphQLResolverContext` is public** (`@blixis-io/contracts`). Resolvers contributed by modules receive it; `@blixis-io/graphql`'s context extends it.
4. **`@blixis-io/database` is a public platform package** for modules that store data (the `DATABASE` token, `tenantColumns`, `tenantScope`, transactions). Modules that don't store data don't need it.

Third-party modules may import `@blixis-io/contracts`, `@blixis-io/kernel`, `@blixis-io/content-api`, and `@blixis-io/database`; the boundary check `plugin-internal-import` enforces it for `examples/*/src`.

## Consequences

- A plugin that reacts to entries depends on `@blixis-io/contracts`, `@blixis-io/kernel` (for `defineModule`), and `@blixis-io/content-api`: a few kilobytes of types, tokens, and schemas.
- Changes to the content service interface or event payloads are public API changes: they are versioned with `@blixis-io/content-api` (plan 018.005) and show up in its API surface report (018.004).
- One more package to build and publish; the pattern costs a package per capability, so it is used only where consumers exist.

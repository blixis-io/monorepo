# 012 — GraphQL Platform & Content Delivery API

## Status

```text
in-progress
```

Milestone: Milestone 6 — Content delivery  
Roadmap scope: MVP / initial platform  
Progress: 1/8 tasks completed

## Objective

Expose a single `/graphql` endpoint (§10) served by GraphQL Yoga inside the API Worker, composed from module contributions, that lets content consumers query published content with a delivery key and draft content with a preview key — calling the same `ContentService` as REST (§2.4) — with protocol-correct error mapping and protection against expensive queries.

## Why this plan exists

§10 prescribes GraphQL Yoga, one platform endpoint, modules contributing schema fragments, and no duplicated domain logic. §45 separates Management (REST) from Delivery (GraphQL) conceptually within one Worker. §22 requires published content publicly and drafts when authorised. §42 Stage 6 lists exactly these items.

## Scope

In scope:

- `@blixis/graphql`: Yoga server setup on Workers, schema composition + validation, shared scalars, context, error mapping
- kernel integration mounting `/graphql`
- delivery and preview API keys (space-scoped) and their actor resolution
- ADR on delivery schema shape (generic vs. per-space generated types)
- content delivery schema and resolvers in `@blixis/content`
- preview (draft) delivery
- depth/complexity/pagination limits and request batching (DataLoader-style)

Out of scope:

- HTTP/edge caching of delivery responses (plan 013)
- GraphQL mutations for management (REST is preferred for administration, §9) — not in MVP
- subscriptions/real-time (non-goal §47)
- persisted queries — evaluated in plan 013 as a caching enabler

## Dependencies

Depends on:

- [011 — Entries, Versions & Publishing](../011-entries-and-publishing/_index.md)

## Architecture decisions

- **GraphQL Yoga** is the runtime (§10); it supports the Fetch API and runs on Workers without Node APIs (verify version compatibility).
- **One endpoint `/graphql`** at the root, outside `/api/v1` (§45 routes).
- **Modules contribute** `typeDefs`/`resolvers`; `@blixis/graphql` composes and validates; modules never create servers (§10).
- **Resolvers are thin**: they call services from `ctx.services` (§10 example, §48 Code.9).
- **Error mapping**: `BlixisError` → GraphQL error with `extensions.code` (`NOT_FOUND`, etc.) per `docs/contracts/errors.md`; unexpected errors masked (§28).
- **Auth**: the same actor resolver chain as REST (007.004), plus delivery/preview key resolver added here.
- **Delivery schema strategy** decided in ADR 0011 before implementing content resolvers.

## Deliverables

- `packages/graphql` with `graphqlModule()` platform module registering `/graphql`.
- Delivery/preview key management REST routes and actor resolver.
- ADR 0011 (delivery schema strategy) accepted.
- Content delivery queries for published and preview content with locale fallback and link resolution.
- Query limits and batching with tests asserting bounded DB queries.

## Tasks

- [x] [001 — Scaffold @blixis/graphql with GraphQL Yoga on Workers](./001-scaffold-graphql-package-with-yoga.md)
- [ ] [002 — Compose and validate the schema from module contributions](./002-schema-composition-and-scalars.md)
- [ ] [003 — Map Blixis errors to GraphQL errors](./003-graphql-error-mapping.md)
- [ ] [004 — Implement delivery and preview API keys](./004-delivery-and-preview-api-keys.md)
- [ ] [005 — Decide the delivery schema strategy](./005-decide-delivery-schema-strategy.md)
- [ ] [006 — Implement content delivery schema and resolvers](./006-content-delivery-schema-and-resolvers.md)
- [ ] [007 — Implement preview (draft) delivery](./007-preview-delivery.md)
- [ ] [008 — Enforce query limits and verify batching](./008-query-limits-and-batching.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] A delivery key can query published entries of its space only; a preview key can query drafts; neither can access another space (isolation test).
- [ ] Composition fails bootstrap on conflicting type definitions naming both modules.
- [ ] Query depth/complexity limits enforced (tests).

## Risks

- **Bundle size**: `graphql-js` + Yoga add significant size; measure against Worker limits and startup time.
- **Per-space dynamic schemas** (if chosen) require schema building and caching per content-model version; cold-start cost and memory must be measured.
- **N+1 queries** across link resolution; batching is mandatory.
- **TS7 compatibility** of GraphQL codegen tooling, if any is used — prefer no codegen in MVP.

## Open questions

- Delivery schema shape: generic (`entries(contentType: "blogPost") { fields }` returning JSON) vs. typed per space (`blogPostCollection { title slug }`) like Contentful? (ADR 0011; recommendation: typed per space/environment generated from content types and cached by content-model version, because it is the main developer-experience value of a headless CMS — with the generic query also available as fallback.)
- Should management queries (content types, entries in drafts for editors) also be exposed via GraphQL for the admin UI? Default: no; admin uses REST.

## Technical notes

No technical notes yet.

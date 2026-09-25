# 010 — Content Modeling

## Status

```text
in-progress
```

Milestone: Milestone 5 — Content management core  
Roadmap scope: MVP / initial platform  
Progress: 3/5 tasks completed

## Objective

Let space members define content types with typed, validated fields (§21 ContentType → FieldDefinition) through the Management REST API, and produce — from a content type — a runtime validator for entry field values that the entries plan (011) and delivery plan (012) reuse. Content-type changes emit versioned events.

## Why this plan exists

§21 and §42 Stage 4 put ContentType and FieldDefinition first in the content domain; §29 requires boundary validation, and in a headless CMS the most important validation is entry data against user-defined models. Entries (011), GraphQL delivery schema generation (012), and the SDK (017) all depend on this model.

## Scope

In scope:

- ADR for content storage (field values representation, localisation, references, schema evolution)
- `modules/content` package scaffold (shared with plan 011)
- content types and field definitions schema, repository, service
- field-type registry (built-in types; extension point decision)
- validator generation from content type definitions
- content-type REST routes, permissions, events
- rules for safe content-type changes when entries exist

Out of scope:

- entries, versions, publishing (plan 011)
- GraphQL (plan 012)
- asset field storage semantics beyond a typed link placeholder (plan 014)
- rich-text editor formats beyond a documented JSON structure (MVP rich text = structured JSON document; exact format decided in ADR)

## Dependencies

Depends on:

- [009 — Authorization & Permissions](../009-authorization-and-permissions/_index.md)

## Architecture decisions

- **One module** `@blixis/content` owns content types, fields, entries, versions (§20 example). Plans 010 and 011 both build it.
- **Tenant scoping**: content types belong to `(space_id, environment_id)` (plan 008 decision).
- **Field values as JSONB** keyed by field ID and locale is the expected direction (ADR 0010 confirms) — relational EAV is rejected for query complexity; JSONB keeps versions immutable and cheap to copy.
- **Validation from the model**: the content type is compiled into a Standard Schema-compatible validator using the ADR 0004 library, so REST, GraphQL, imports, and queue consumers validate identically.
- **Field-type extensibility**: built-in field types in MVP; a public extension point (third-party field types) is an explicit open question — the registry is designed so it can be exposed later without breaking changes.
- **Events**: `content-type.created/updated/deleted` (§15) — best-effort unless a consumer (GraphQL schema cache) needs guarantees; decided in 012/013 and recorded in the events table.

## Deliverables

- ADR 0010 (content storage model) accepted.
- `modules/content` registered with content-type migrations.
- REST: `GET/POST /api/v1/spaces/:spaceId/content-types`, `GET/PATCH/DELETE /api/v1/spaces/:spaceId/content-types/:contentTypeId`.
- `compileEntrySchema(contentType, locales)` producing a validator with precise issue paths.
- Isolation and authorization matrices extended.

## Tasks

- [x] [001 — Decide the content storage model](./001-content-storage-design.md)
- [x] [002 — Scaffold the content module and content type schema](./002-content-module-scaffold-and-type-schema.md)
- [x] [003 — Implement the built-in field type system](./003-field-type-system.md)
- [ ] [004 — Compile entry validators from content types](./004-entry-schema-compiler.md)
- [ ] [005 — Implement the content type service and REST routes](./005-content-type-service-and-routes.md)

## Completion criteria

The plan may be marked `completed` when:

- [ ] All tasks `completed`.
- [ ] Content type with every built-in field type can be created, and generated validators accept valid and reject invalid payloads with field/locale paths.
- [ ] Destructive content-type changes are blocked or require explicit confirmation per the rules.
- [ ] Isolation (008.006) and authz matrix (009.005) cover the new routes.

## Risks

- **Schema evolution**: changing field types with existing entries can invalidate stored versions; rules must be conservative in MVP.
- **Validator performance** on large content types; cache compiled validators per content-type version within the request/isolate.
- **Over-flexible field system** early; stick to a minimal built-in set.

## Open questions

- Should third-party modules be able to register field types in MVP (e.g. an SEO module adding a `seo` field)? Default: no public API in MVP; revisit in plan 018 with the example plugin.
- Rich text format: portable JSON AST (e.g. ProseMirror/Tiptap-compatible, or a Blixis-defined subset) vs. Markdown string? Decided in ADR 0010.
- Maximum fields per content type and max entry payload size? Set in ADR 0010 with Workers/Postgres limits in mind.

## Technical notes

No technical notes yet.

# 0010 — Content storage model

- Status: accepted
- Date: 2026-09-25
- Roadmap task: [010.001](../plans/010-content-modeling/001-content-storage-design.md)

## Context

§21–§22 define `ContentType → FieldDefinition` and `Entry → EntryVersion` (immutable versions). §13 keeps everything in Postgres, and §31 scopes every row to a tenant. The model must serve three consumers:
- the management REST API (plans 010, 011);
- GraphQL delivery with schema generation (plan 012);
- the SDK and site renderers (plans 017, 018).

It must also work for page building. The owner's StAAD CMS, reviewed 2026-09-25, builds website pages from a **block library**: reusable components with typed fields, nested through a `blocks` field and rendered one-to-one by frontend components. It also uses conditional fields (`showWhen`), field tabs, and a `link` field type. StAAD shows what the model needs, and also two weaknesses to avoid:
- blocks are referenced by slug, so renames break content;
- field configuration is unvalidated JSON.

## Decision

### 1. Content types and components

- A **content type** belongs to one `(organization, space, environment)`.
- It has `kind`:
  - **`entry`**: instances are entries with their own lifecycle (draft, publish; plan 011).
  - **`component`**: a reusable block that exists only **inside** another entry's `blocks` field. It has no lifecycle of its own and is published with its parent.
- Fields are a **JSONB array on `content.content_types`** (`fields jsonb`), not a `content_fields` table:
  - a type is always read and written whole;
  - the array order is the editing order;
  - every change bumps `version` (optimistic concurrency and compiled-schema cache key);
  - no query needs fields across types.
- `groups` (editor tabs) is a JSONB array on the type. `display_field_id` points at the field used as an entry's title.

### 2. Identifiers

| Thing | Stable id (storage) | API id (clients) | Rules |
|---|---|---|---|
| Content type / component | UUIDv7 | `apiId` | `^[a-z][a-zA-Z0-9]{0,63}$`, unique per environment across both kinds |
| Field | 8-character random id (`[a-zA-Z0-9]`), unique within its type | `apiId` | same pattern, unique within the type. Reserved: `id`, `sys`, `type`, and anything starting with `_` |

- Stored data **always uses stable ids**: field ids as keys, and component type ids in block instances. Renaming an `apiId` never rewrites entries.
- The API translates to and from `apiId`s, and settings that point at types (allowed components, allowed reference targets) store type ids.

### 3. Entry field values (shape used by plan 011)

Management API payload:

```json
{
  "fields": {
    "title": { "en-US": "Hello", "nl-NL": "Hallo" },
    "slug": "hello",
    "body": { "en-US": [ { "_id": "k3J9aQ2x", "_type": "hero", "heading": "Welcome" } ] }
  }
}
```

- **Localized fields** (`localized: true`) take a map `{ [localeCode]: value }` whose keys are locales of the space.
- **Non-localized fields** take the plain value. Which one applies is known from the type. Changing `localized` is blocked once entries exist, so the shapes never mix.
- **Storage** (`entry_versions.fields jsonb`) is the same shape keyed by **field id**, and inside block instances `_type` holds the component's **type id**.
- **Missing locales** resolve at read time through the space's locale fallback chain (008.004). Stored data never contains copies of fallback values.
- **Components are localized as a whole:** fields of `component` types can't be `localized`. The containing `blocks` field is localized (or not), so a page body is translated per locale, as in StAAD.

### 4. Built-in field types

| Type | Value | Key settings |
|---|---|---|
| `text` | string (≤ 256 by default) | `minLength`, `maxLength`, `pattern`, `format` (`plain`/`slug`/`email`/`url`) |
| `longText` | string (≤ 50 000) | `minLength`, `maxLength` |
| `richText` | document (below) | `nodes`, `marks`, `headingLevels` |
| `number` | number | `integer`, `min`, `max` |
| `boolean` | boolean | — |
| `date` | `YYYY-MM-DD` | `min`, `max` |
| `dateTime` | ISO 8601 with offset | — |
| `select` | string or string[] | `options[{value,label}]`, `multiple`, `min`/`max` |
| `json` | any JSON (≤ 64 KiB) | — |
| `reference` | `{ type:'entry', id }` or array | `contentTypeIds`, `multiple`, `min`/`max` |
| `asset` | `{ type:'asset', id }` or array | `mimeTypes`, `multiple`, `min`/`max` |
| `link` | `{ kind:'entry', id } \| { kind:'url', url } \| { kind:'email', email } \| { kind:'phone', phone }`, plus optional `text`, `title`, `newTab` | `kinds`, `contentTypeIds`, `text` |
| `blocks` | `[{ _id, _type, …component fields }]` | `componentIds`, `min`, `max` |

- Every field also has `required` and `localized`, plus presentation settings (§6).
- The **field type registry** is extensible. Modules pass their own types to `contentModule({ fieldTypes })`, namespaced `vendor.name` so they can never collide with built-ins. See the manual's *Custom field types*.

### 5. Rich text

- **Format:** JSON compatible with ProseMirror/TipTap, so the admin UI (plan 019) can use an off-the-shelf editor:
  ```json
  { "type": "doc", "content": [ { "type": "paragraph", "content": [ { "type": "text", "text": "Hi", "marks": [ { "type": "bold" } ] } ] } ] }
  ```
- **Nodes:** `paragraph`, `heading` (`attrs.level` 1–6), `bulletList`, `orderedList`, `listItem`, `blockquote`, `codeBlock`, `horizontalRule`, `hardBreak`, `table`/`tableRow`/`tableHeader`/`tableCell`, `embeddedEntry`, `embeddedAsset`, `text`.
- **Marks:** `bold`, `italic`, `underline`, `strike`, `code`, `link` (`attrs.href`, optional `attrs.entryId`).
- Unknown nodes and marks are rejected, and settings can narrow them per field. Nesting depth is at most 20.

### 6. Presentation

These settings shape the editing experience and aren't content:
- `description`: help text;
- `group`: the id of a tab in the type's `groups`;
- `hidden`: kept in the API but hidden in editors;
- `showWhen: { field: <fieldId>, equals: <json> }`.

`showWhen` also changes validation. **A field whose condition doesn't hold is not required.** The condition field must be a non-localized sibling in the same type or component.

### 7. References and integrity

- Links are stored as `{ type, id }`. Drafts may contain dangling links.
- **Publishing** (plan 011) verifies that referenced entries exist in the same environment and that their type is in the allowed list.
- **Delivery** omits links that don't resolve.
- There are no foreign keys into entry JSON.

### 8. Limits

| Limit | Value |
|---|---|
| Fields per type | 100 |
| Content types per environment | 500 (enforced in 010.005) |
| Items per `blocks` field (default `max`) | 100 |
| Block nesting depth | 5 |
| Rich-text nesting depth | 20 |
| `json` value | ≤ 64 KiB |
| Serialized entry version | ≤ 1 MiB (plan 011) |

### 9. Querying

- Delivery filters in the MVP (equality on `text`, `select`, `boolean`, `number`, `date`, and on reference id) run against `entry_versions.fields` with a `jsonb_path_ops` GIN index, created in plan 011.
- Expression or generated-column indexes for hot filters are added only after measurement (§34).

### 10. Schema evolution

| Change | Rule |
|---|---|
| Add a field, change name/description/presentation, rename `apiId`s, reorder | always allowed |
| Change `required` or settings (e.g. `maxLength`) | allowed. Existing entries are re-validated on their next save or publish |
| Change a field's `type` or `localized` | `ConflictError` while entries of the type exist |
| Remove a field | allowed while no entries exist. Otherwise set `disabled: true` first: it's then omitted from APIs and validation but kept in stored versions. A disabled field can then be removed |
| Change `kind` | `ConflictError` while entries exist or other types use the component |
| Delete a type | `ConflictError` while entries exist, or while other types reference it (`componentIds`, `contentTypeIds`) |

Every change increments `version` and emits `content-type.updated`. Clients send the `version` they edited, and a stale version gets `409`.

## Alternatives considered

- **`content_fields` rows:** gives per-field constraints, but types are always handled whole. It would cost joins, ordering columns and multi-row versioning for no query we need.
- **Values keyed by `apiId`:** simpler reads, but every rename rewrites all versions, which breaks immutability (§22). StAAD's slug references show the failure mode.
- **Non-localized values under the default locale key** (Contentful): changing the space's default locale would change stored keys.
- **Components as separate entries only** (Contentful): every block becomes an entry with its own publish state. That's heavy for page building, and pages can't be published atomically.
- **Markdown or HTML rich text:** HTML can't be rendered safely without sanitising everywhere, Markdown can't hold embeds cleanly, and neither maps to GraphQL types.
- **Fixed field types only:** simpler, but modules (and sites like StAAD with custom needs) would fall back to `json` fields without validation.

## Consequences

- One JSONB document per entry version holds all locales. Versions are cheap to copy, and publishing a page with its blocks is atomic.
- The API layer must translate between `apiId` and stable ids in both directions. This lives in the entry schema compiler (010.004) and its inverse.
- GraphQL (plan 012) generates one object type per content type and component, and a union per `blocks` field.
- Page trees with path-based delivery, menus and datasources are **not** part of the core model. They're planned as modules on top: the entries plus `link`/`reference`, and good tests of the module contract.

# 010.003 — Implement the built-in field type system

## Status

```text
completed
```

## Parent plan

[010 — Content Modeling](./_index.md)

## Objective

Implement a field-type registry with the MVP built-in types, each defining its settings schema, value schema builder, and default values, used by the validator compiler.

## Background

§21 FieldDefinition; ADR 0010 defines representations. Keeping field types in a registry (instead of switch statements across the codebase) is what later allows extension (open question) and GraphQL type mapping (012).

## Requirements

- Built-in types: `text` (short), `longText`, `richText`, `number` (integer/decimal flag), `boolean`, `date`/`dateTime`, `select` (enum), `json`, `reference` (entry link, allowed content types, single/many), `asset` (asset link placeholder — validated as `{type:'asset', id}`; existence checks in 014.005), `list` of primitives (if ADR allows).
- Each type: `id`, `settingsSchema` (validates field settings), `buildValueSchema(settings)` (validator for one locale value), `graphqlHint` metadata for plan 012 (scalar/object name), and `isEmpty(value)`.
- Registry is internal to `@blixis/content` in MVP (not exported for third parties) — document the extension question.
- Unit tests per type: settings validation and value validation edge cases.

## Architectural constraints

- Uses the ADR 0004 validation library; no Workers-incompatible dependencies.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/src/field-types/define.ts
modules/content/src/field-types/built-in/index.ts
modules/content/src/field-types/built-in/shared.ts
modules/content/src/field-types/built-in/scalars.ts
modules/content/src/field-types/built-in/links.ts
modules/content/src/field-types/built-in/rich-text.ts
modules/content/src/field-types/built-in/blocks.ts
modules/content/src/rest/field-types.routes.ts
modules/content/test/field-types.test.ts
```

### Modify

```text
modules/content/src/module.ts
modules/content/src/index.ts
tooling/postman/blixis.postman_collection.json
```

### Delete

```text
None.
```

## Implementation steps

1. Define the field-type interface.
2. Implement each built-in type.
3. Tests.

## Expected interfaces or contracts

> Planning sketch only. Final names may change during implementation; record deviations in Technical notes.

```ts
interface FieldTypeDefinition<TSettings, TValue> {
  readonly id: string
  readonly settingsSchema: StandardSchemaV1<unknown, TSettings>
  buildValueSchema(settings: TSettings): StandardSchemaV1<unknown, TValue>
  isEmpty(value: TValue): boolean
  readonly graphql: { readonly kind: 'scalar' | 'link' | 'object'; readonly typeName: string }
}
```

## Dependencies

Requires:

- [010.002 — Scaffold the content module and content type schema](./002-content-module-scaffold-and-type-schema.md)

## Acceptance criteria

- [x] Every built-in type has settings and value tests including invalid inputs.
- [x] Registry rejects unknown field type IDs with `ValidationError`.

## Validation

```bash
pnpm --filter @blixis/content test
```

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] Registry design allows a future public extension point without breaking changes.

## Completion conditions

Change the status to `completed` only when all of the following hold:

1. Implementation is finished and every requirement above is met.
2. Every acceptance criterion is checked.
3. All validation steps pass.
4. The task has passed through `review` and every review checklist item is checked.
5. `Technical notes` are updated with findings from implementation, testing, and review.
6. `Files and folders` reflects the actual change set.
7. The task checkbox and status are updated in [`docs/ROADMAP.md`](../../ROADMAP.md).
8. The parent [`_index.md`](./_index.md) task list, progress count, and plan status are updated (plan becomes `completed` only when all tasks are completed and the plan completion criteria hold).

## Technical notes

- **`FieldTypeDefinition`:**
  - `id`, `name` and `description`;
  - `settings`: a strict Zod schema with defaults;
  - `value(settings, context)`: the validator for one locale value;
  - optional `isEmpty`, `localizable` and `graphql(settings)` (a hint for plan 012).
- **`FieldValueContext`:** carries `mode` (`draft`/`publish`: minimum item counts are enforced on publish only), `depth`, and `component(apiId)` for `blocks`. The entry schema compiler (010.004) supplies it.
- **Built-in types (13, ADR 0010 §4):**
  - `text`, with formats `plain`/`slug`/`email`/`url` and a `pattern` that rejects unsafe regular expressions: longer than 200 characters, uncompilable, or with nested quantifiers such as `(a+)+` (ReDoS). Values are capped at 256 characters.
  - `longText`, `number` (int/float, which drives the GraphQL hint), `boolean`, `date` (`z.iso.date`, calendar-checked, min/max), `dateTime` (ISO with offset);
  - `select` (unique options and values, `multiple` + min/max), `reference`/`asset` (`{type,id}` links, `contentTypeIds`/`mimeTypes`), `link` (a discriminated union by `kind`, http(s) only, text/new-tab rules), `json` (≤ 64 KiB).
  - `richText`: a ProseMirror/TipTap document walker. It checks node nesting rules, the allowed nodes, marks and heading levels per field, safe link hrefs, embeds with UUID ids, and depth ≤ 20, and it reports precise paths.
  - `blocks`: loose `{ _id, _type }` items validated by the resolved component's schema, with unique `_id`s, allowed `componentIds`, and depth ≤ 5.
- **Deviation from "registry internal in MVP":**
  - The registry is **public and extensible**: `contentModule({ fieldTypes })` with `vendor.name` ids that can't shadow built-ins, and duplicates rejected (`ModuleError`).
  - It's app-scoped under `FIELD_TYPES`.
  - `GET /api/v1/field-types` lists each type with its settings as JSON Schema (`z.toJSONSchema`, input side), for editors and documentation.
  - This follows the owner's request for documented extension points.

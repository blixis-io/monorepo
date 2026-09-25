# 010.004 — Compile entry validators from content types

## Status

```text
completed
```

## Parent plan

[010 — Content Modeling](./_index.md)

## Objective

Implement `compileEntrySchema(contentType, localeContext)` that produces a validator for entry field payloads (all locales), with required-field rules applied per mode (draft vs. publish), precise issue paths, and caching per content-type version.

## Background

§29 wants inference and no duplicated validation logic. Entries (011) validate drafts leniently (required fields may be missing) and publish strictly; GraphQL input and imports reuse the same compiler.

## Requirements

- Modes: `draft` (types validated, required not enforced), `publish` (required enforced for default locale and for all locales where `localized` and locale is marked required — per ADR).
- Unknown fields rejected; non-localized fields accept only the designated key.
- Issue paths: `fields.<apiId>.<locale>[.<nested>]`.
- Cache compiled schemas keyed by `(contentTypeId, contentTypeVersion, localeSetHash, mode)` in an isolate-level LRU (bounded) — pure data, safe for app scope.
- Tests covering locale rules, unknown fields, required rules per mode, and nested reference arrays.

## Architectural constraints

- Cache must not hold request-scoped objects.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
modules/content/src/application/entry-schema.ts
modules/content/test/entry-schema.test.ts
```

### Modify

```text
modules/content/src/index.ts
```

### Delete

```text
None.
```

## Implementation steps

1. Implement compiler over field-type registry.
2. Implement modes and locale handling.
3. Implement bounded cache.
4. Tests.

## Dependencies

Requires:

- [010.003 — Implement the built-in field type system](./003-field-type-system.md)

## Acceptance criteria

- [x] Draft validation accepts missing required fields; publish validation rejects them with correct paths.
- [x] Compiled schemas are reused for the same content-type version (cache test).

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
- [x] Validator output types are inferred, not hand-duplicated.

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

- **`compileEntrySchema({ contentType, types, locales, defaultLocale, mode, registry })`** returns `validate`, `toStorage` and `fromStorage`.
- **Validation (API shape, keyed by `apiId`):**
  - unknown and disabled fields are rejected;
  - localized fields take `{ locale: value }` maps whose keys must be space locales; non-localized fields take plain values;
  - each value is validated by its field type;
  - `required` applies only in `publish` mode, to the default locale for localized fields, and only while the `showWhen` condition holds (a JSON-equality check on a sibling field).
- **Issue paths:** `fields.<apiId>[.<locale>][.<index>.<nested>…]`, e.g. `fields.body.en-US.1.children.0.heading`.
- **Components:**
  - resolved by `apiId` from the environment's `component` types and compiled lazily per `(componentId, depth)`, so self-nesting works;
  - the `blocks` field type enforces the depth limit (5);
  - component fields are checked with the same rules, without locale maps.
- **Mapping:** `toStorage`/`fromStorage` translate field keys (`apiId` ↔ stable id) and block `_type` (component `apiId` ↔ component id) recursively. Disabled and unknown stored keys are dropped on read, and renaming an `apiId` keeps stored data readable (tested).
- **`createEntrySchemaCache(capacity = 200)`:**
  - an isolate-level LRU;
  - the key covers the type id and version, mode, default locale, locales, and every component's `id:version`, so a model change never hits a stale entry;
  - it holds only pure data (no request-scoped objects).
- **Exported publicly** (the plan's default was internal), so plan 011 and modules such as importers validate exactly like the API.

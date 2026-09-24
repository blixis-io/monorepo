# 010.001 — Decide the content storage model

## Status

```text
not-started
```

## Parent plan

[010 — Content Modeling](./_index.md)

## Objective

Record ADR 0010 defining how content types, field definitions, entry field values, localisation, references, rich text, and schema evolution are represented in Postgres and in API payloads.

## Background

§21–§22 define the domain and draft/published versioning; §13 keeps it in Postgres. The storage model constrains querying (filtering entries by field values), delivery performance, and version immutability. This decision precedes any content table.

## Requirements

- Decide representation of field definitions: rows in `content_fields` vs. JSONB array on `content_types` (recommendation: rows for stable IDs + ordering + constraints; or JSONB with stable field IDs — decide).
- Decide entry values: `entry_versions.fields jsonb` shape `{ [fieldId]: { [locale]: value } }` vs. per-locale version rows; stable field IDs (not API names) as keys so renames don't rewrite data.
- Decide field API identifiers (`apiId`), naming rules, and uniqueness.
- Decide localisation: per-field `localized: boolean`; non-localized fields stored under the default locale key or a sentinel; fallback resolution at read time using locale fallback chains (008.004).
- Decide references: entry→entry and entry→asset links as `{ type: 'entry'|'asset', id }`; referential integrity strategy (validated on publish; dangling references allowed in drafts?).
- Decide rich text format.
- Decide limits (fields per type, payload size, nesting depth).
- Decide querying/indexing approach for delivery filters (JSONB GIN index vs. generated columns later).
- Decide schema evolution rules (additive changes free; type changes blocked when entries exist; deletions soft-disable first).

## Architectural constraints

- Must support immutable versions (§22 — never overwrite the only copy).
- Must be multi-tenant scoped (§31).

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0010-content-storage-model.md
```

### Modify

```text
None.
```

### Delete

```text
None.
```

## Implementation steps

1. Draft options with example payloads and SQL.
2. Evaluate query patterns needed by delivery (by content type, by field equality, ordering, pagination, locale).
3. Write ADR 0010 including example JSON for an entry version.

## Dependencies

Requires:

- [009.005 — Build the authorization test matrix](../009-authorization-and-permissions/005-authorization-test-matrix.md)

## Acceptance criteria

- [ ] ADR 0010 accepted, covering every requirement bullet with concrete examples.

## Validation

- Review against §21, §22, §31 and plan 012 delivery query needs.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Decision allows adding field-level permissions and additional environments later without data migration.

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

No technical notes yet.

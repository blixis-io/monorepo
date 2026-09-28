# 018.001 — Relocate public content capability contracts

## Status

```text
completed
```

## Parent plan

[018 — Extension Platform & Example Plugin](./_index.md)

## Objective

Record ADR 0016 and move the public, consumer-facing content types and service tokens (`CONTENT_SERVICE`, `ContentService`, `Entry`, `ContentType`, content event definitions) into the chosen public package so third-party modules depend on capabilities, not on the `@blixis/content` implementation package.

## Background

§44 future improvement; §8 capabilities over package names; §25 plugins primarily depend on contracts.

## Requirements

- ADR 0016 decides location (recommendation: `packages/content-api` → `@blixis/content-api`, types/tokens/event definitions only, zero runtime deps beyond contracts).
- Move definitions; `@blixis/content` re-exports for compatibility and implements them.
- Apply the same pattern where assets are concerned (`ASSET_SERVICE` public types) if the example plugin needs them — keep minimal.
- Update module docs and boundary rules (plugins may import `@blixis/content-api`, not `@blixis/content`).

## Architectural constraints

- No behavioural change; tests must remain green.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
docs/decisions/0016-public-capability-contracts.md
packages/content-api/{package.json,tsconfig.json,tsconfig.test.json}
packages/content-api/src/{index.ts,content-types.ts,entries.ts,events.ts,schema.ts,schema.test.ts}
```

### Modify

```text
modules/content/src/{events.ts,domain/content-type.ts,domain/entry.ts,application/content.service.ts,application/content-type.service.ts,application/entry-schema.ts,infrastructure/content-type.repository.ts}
modules/content/{package.json,tsconfig.json}
modules/webhooks/src/application/public-events.ts, modules/webhooks/{package.json,tsconfig.json}
tooling/boundaries/src/{rules.ts,rules.test.ts} (public-api-dependency)
tsconfig.json
apps/docs/astro.config.mjs (API reference), apps/docs/src/content/docs/concepts/{events,entries-and-publishing,testing}.mdx
docs/contracts/{README.md,events.md}
docs/decisions/README.md, docs/ROADMAP.md, docs/plans/018-extension-platform/_index.md
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. ADR 0016.
2. Create package; move definitions.
3. Update consumers to import from the public package.
4. Run full test suite.

## Dependencies

Requires:

- [017.004 — Build the Astro example site](../017-sdk-and-example-consumer/004-example-astro-site.md)

## Acceptance criteria

- [x] First-party consumers (webhooks, releases) import content tokens/events from the public package only.
- [x] Full test suite green.

## Validation

```bash
pnpm typecheck && pnpm lint && pnpm test
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
- [x] Public package contains no implementation code.

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

- **Decision:** [ADR 0016](../../decisions/0016-public-capability-contracts.md), `@blixis/content-api` with `@blixis/contracts` as its only (peer) dependency. Enforced by the new boundary rule `public-api-dependency`.
- **Moved:** `CONTENT_SERVICE`/`ContentService`, `CONTENT_TYPE_SERVICE`/`ContentTypeService`, `EntrySys`, `EntryView`, `EntryVersionView`, `EntryListQuery`, `EntryStatus`, `EntryState`, `ApiFields`, `EnvironmentTenant`, `ContentType`, `ContentTypeKind`, `CONTENT_TYPE_KINDS`, `FieldDefinition`, `FieldGroup`, `ShowWhen`, `FieldView`, `ContentTypeView`, the input types (`FieldInput`, `CreateContentTypeInput`, `UpdateContentTypeInput`), and the eight content events. `@blixis/content` imports and re-exports them, so no import breaks.
- **No runtime change:** token ids (`@blixis/content.entries`, `@blixis/content.content-types`) and event types/versions/delivery classes are unchanged.
- **Event schemas without Zod:** `struct()` is a tiny Standard Schema for flat payloads (string, optional string, integer, enum), dropping unknown keys like Zod objects. Tested with `validateSync`.
- **Input types are plain interfaces;** the content module checks its Zod schemas against them with `SameShape` (compile time). Finding: Zod's input type makes `showWhen.equals` required (`z.unknown()` key), so the public type does too.
- **Webhooks** now peer-depend on `@blixis/content-api` instead of `@blixis/content` (tests still use the implementation). Asset events stay in `@blixis/assets` for now (ADR 0016 §6).
- **Field type authoring** (`defineFieldType`) stays in `@blixis/content` (Zod-based, registered through `contentModule({ fieldTypes })`).

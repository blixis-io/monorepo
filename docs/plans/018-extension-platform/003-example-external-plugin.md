# 018.003 — Build the example external SEO plugin

## Status

```text
not-started
```

## Parent plan

[018 — Extension Platform & Example Plugin](./_index.md)

## Objective

Create `examples/blixis-example-seo` — `@blixis-example/seo` — outside the workspace globs, implementing: an SEO metadata service, `GET/PUT /api/v1/entries/:id/seo` routes, a GraphQL `seo` field on delivered entries, `seo.read`/`seo.write` permissions, a migration, and an `entry.published` handler — using only public packages.

## Background

§42 Stage 8 and §44 describe exactly this example; §52 requires it be maintained.

## Requirements

- Own `package.json` with peer deps on `@blixis/contracts`, `@blixis/kernel`, `@blixis/content-api`; dev deps from packed tarballs.
- Options schema (`defaultTitle`), capability requirement `blixis.content`.
- Own tests using `@blixis/testing` (installed from tarball) booting it with first-party modules.
- README showing installation into `apps/api` (`pnpm add`, import in `blixis.config.ts`).

## Architectural constraints

- Must not import any path outside public package roots (lint rule applies).
- Not included in `pnpm-workspace.yaml` globs.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
examples/blixis-example-seo/package.json
examples/blixis-example-seo/tsconfig.json
examples/blixis-example-seo/src/index.ts
examples/blixis-example-seo/src/seo.service.ts
examples/blixis-example-seo/src/routes.ts
examples/blixis-example-seo/src/graphql.ts
examples/blixis-example-seo/src/migrations/0001_create_seo.sql
examples/blixis-example-seo/test/seo.test.ts
examples/blixis-example-seo/README.md
```

### Modify

```text
.gitignore (tarball artifacts)
```

### Delete

```text
None.
```

## Implementation steps

1. Pack public packages to a local directory.
2. Build the plugin against tarballs.
3. Tests with `createTestBlixis`.
4. README.

## Dependencies

Requires:

- [018.002 — Write the module authoring guide and security model](./002-authoring-guide-and-security-model.md)

## Acceptance criteria

- [ ] Plugin tests pass using tarball-installed packages.
- [ ] Any required internal import is treated as a contract gap: fix the contract, not the plugin (record gaps in Technical notes).

## Validation

```bash
pnpm -r --filter "./packages/**" pack --pack-destination .artifacts
cd examples/blixis-example-seo && pnpm install && pnpm test
```

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Contract gaps found and resolved are listed.

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

# 018.004 — Add the extension contract CI gate and API surface reports

## Status

```text
not-started
```

## Parent plan

[018 — Extension Platform & Example Plugin](./_index.md)

## Objective

Add a CI job that packs public packages, installs the example plugin into a scratch copy of `apps/api`, runs its tests and a Worker dry-run build, and verifies public API surface reports for contracts/kernel/content-api are up to date.

## Background

§52 continuously prove the design; §48 Code.12 backwards-compatible public contracts.

## Requirements

- CI job `extension-contract`: pack → install plugin → register in a generated test config → Workers-pool smoke test hitting plugin route and GraphQL field → `wrangler deploy --dry-run`.
- API surface report: generate `.d.ts` rollup or export list per public package using a TS7-compatible approach (e.g. comparing emitted `index.d.ts` files or a simple export snapshot) — document; fail CI on unreviewed changes.
- Document the process for intentional contract changes (update snapshot + `feat(contracts)!:`/`BREAKING CHANGE` commit so the version bump is correct; see 018.005).

## Architectural constraints

- Gate runs on every PR touching `packages/**` or `modules/**`.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
.github/workflows/extension-contract.yml
tooling/api-surface/package.json
tooling/api-surface/src/snapshot.ts
docs/api-surface/contracts.api.md
docs/api-surface/kernel.api.md
docs/api-surface/content-api.api.md
```

### Modify

```text
package.json
docs/extensions/authoring-guide.md
```

### Delete

```text
None.
```

## Implementation steps

1. Surface snapshot tooling.
2. CI workflow.
3. Documentation.

## Dependencies

Requires:

- [018.003 — Build the example external SEO plugin](./003-example-external-plugin.md)

## Acceptance criteria

- [ ] CI job green; changing a public export without updating the snapshot fails CI.
- [ ] CP7 recorded in ROADMAP.

## Validation

- Observe CI run; perform one intentional surface change on a branch to confirm failure.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Gate cannot be bypassed silently (required status check noted in 021).

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

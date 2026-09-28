# 018.004 — Add the extension contract CI gate and API surface reports

## Status

```text
completed
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
tooling/api-surface/{package.json,tsconfig.json}
tooling/api-surface/src/{surface.ts,surface.test.ts,cli.ts}
docs/api-surface/{contracts,kernel,content-api,database}.api.md
examples/extension-smoke/{package.json,pnpm-workspace.yaml,wrangler.jsonc,worker/worker.ts}
```

### Modify

```text
.github/workflows/ci.yml (api-surface check in verify; extension-contract job)
package.json (api-surface:update, api-surface:check)
tsconfig.json, pnpm-lock.yaml
docs/contracts/README.md (snapshots, intentional changes), docs/extensions/README.md
docs/ROADMAP.md (CP7), docs/plans/018-extension-platform/_index.md
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

- [x] CI job green; changing a public export without updating the snapshot fails CI.
- [x] CP7 recorded in ROADMAP.

## Validation

- Observe CI run; perform one intentional surface change on a branch to confirm failure.

## Review checklist

- [x] Implementation matches this task specification (requirements and constraints).
- [x] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [x] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [x] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [x] Tests added for new behavior; validation commands pass.
- [x] Documentation matches the implementation.
- [x] `Files and folders` reflects the actual change set.
- [x] `Technical notes` updated with relevant findings.
- [x] Gate cannot be bypassed silently (required status check noted in 021).

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

- **API surface without a compiler API** (TS 7, ADR 0001): `tooling/api-surface` follows the relative imports of `tsc`'s emitted `.d.ts` files from each package's `exports` (tsc keeps `.ts` specifiers in declarations) and writes them, normalized, to `docs/api-surface/<pkg>.api.md`. Unexported internal files aren't part of it. Packages: `@blixis/contracts`, `@blixis/kernel`, `@blixis/content-api`, `@blixis/database` (the public set of ADR 0016). `pnpm api-surface:check` runs in `verify` after Build.
- **Verified:** adding an export to contracts and rebuilding makes the check fail with the path of the stale snapshot; reverting makes it pass.
- **`extension contract` job** (in `ci.yml`, on every PR and push, so it can become a required check in 021 without path filters leaving PRs pending): Postgres service → `pnpm pack:public` → the plugin's install, typecheck, tests, build, and `pnpm pack` → `examples/extension-smoke` installs the packed plugin with first-party tarballs and runs `wrangler deploy --dry-run` (about 445 kB gzip).
- **Deviation:** the requirement's Workers-pool smoke test is replaced by the dry-run bundle plus the Node tests. `pg` can't connect inside the Vitest Workers pool (plan 005), so a Workers-pool test couldn't reach the plugin's routes; the bundle proves Worker compatibility and the Node tests prove behavior against Postgres.
- **The smoke app** keeps its entry in `worker/`, not `src/`, because it imports first-party modules and the `plugin-internal-import` rule covers `examples/*/src`.
- **Required status check:** noted for plan 021 (branch protection): `extension contract` alongside `verify`, `e2e (admin)`, and `pr-title`.

# 018.005 — Version and publish public packages

## Status

```text
not-started
```

## Parent plan

[018 — Extension Platform & Example Plugin](./_index.md)

## Objective

Configure versioning for public `@blixis/*` packages — preferably release-please in manifest mode (same tool as platform releases, driven by Conventional Commits; changesets only if release-please cannot express the need) — make packages publish-ready (metadata, `files`, licence, provenance), and add a release workflow publishing to npm.

## Background

§25 third-party modules depend on published contracts; §48 Code.12 semver discipline; 018.004 API surface snapshots.

## Requirements

- Release tooling config (release-please manifest entries per public package, or changesets — record the decision); private packages excluded (`apps/*`, modules not yet public); package tags like `contracts-v0.3.0` distinct from platform tags `vX.Y.Z` so package releases never trigger production deploys.
- Package metadata: `license`, `repository`, `homepage`, `engines`, `publishConfig.access`, `provenance`.
- Choose licence (decision point — ask the project owner; do not guess).
- Publish job in `release.yml` for package releases: npm provenance (or trusted publishing via OIDC); never on platform `vX.Y.Z` tags.

## Architectural constraints

- Do not publish before the licence and scope ownership are confirmed.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
LICENSE (after decision)
```

### Modify

```text
release-please-config.json
.release-please-manifest.json
.github/workflows/release.yml
package.json
packages/contracts/package.json
packages/kernel/package.json
packages/content-api/package.json
packages/sdk/package.json
packages/testing/package.json
docs/extensions/authoring-guide.md
README.md
pnpm-lock.yaml
```

### Delete

```text
None.
```

## Implementation steps

1. Confirm licence and scope.
2. Configure release tooling and package metadata.
3. Release workflow.
4. Dry-run publish (`pnpm publish --dry-run`), then first prerelease.

## Dependencies

Requires:

- [018.004 — Add the extension contract CI gate and API surface reports](./004-extension-contract-ci-gate.md)

## Acceptance criteria

- [ ] Dry-run publish succeeds for all public packages.
- [ ] First prerelease published (or blocked with documented reason).

## Validation

```bash
pnpm -r --filter "./packages/**" pack --pack-destination .artifacts
pnpm -r --filter "./packages/**" publish --dry-run
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
- [ ] Published tarballs contain only `dist` and metadata (inspect `pnpm pack` output).

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

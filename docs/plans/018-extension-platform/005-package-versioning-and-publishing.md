# 018.005 — Version and publish public packages

## Status

```text
completed
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
LICENSE, packages/{contracts,kernel,content-api,database,events,shared,testing,sdk}/{LICENSE,README.md}
release-please-config.json, .release-please-manifest.json
.github/workflows/release-packages.yml
docs/decisions/0020-package-scope-and-licence.md (with the scope rename, PR #140)
docs/operations/package-releases.md
```

### Modify

```text
packages/{contracts,kernel,content-api,database,events,shared,testing,sdk}/package.json (metadata, peers)
packages/{cloudflare,graphql}/package.json, modules/*/package.json, apps/*/package.json, tooling/*/package.json (private)
package.json (license), pnpm-lock.yaml
tooling/boundaries/src/{rules.ts,rules.test.ts} (published-dependency)
README.md, docs/operations/github-actions.md
docs/ROADMAP.md, docs/plans/018-extension-platform/_index.md
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

- [x] Dry-run publish succeeds for all public packages.
- [x] First prerelease published (or blocked with documented reason).

## Validation

```bash
pnpm -r --filter "./packages/**" pack --pack-destination .artifacts
pnpm -r --filter "./packages/**" publish --dry-run
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
- [x] Published tarballs contain only `dist` and metadata (inspect `pnpm pack` output).

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

- **Owner decisions** ([ADR 0020](../../decisions/0020-package-scope-and-licence.md), D20): npm organization `blixis-io` (all packages renamed in PR #140; runtime module ids stay `@blixis/…`), MIT licence, the published set left to the implementer.
- **Published set:** contracts, kernel, content-api, database, testing, sdk, plus events and shared (dependencies of testing and database). Everything else is `private: true`.
- **Peers for one copy per app:** published packages now peer-depend on other Blixis packages (except `shared`), `drizzle-orm`, and `hono` (they were plain dependencies, which could install duplicates and break `instanceof` on errors). Peers use `workspace:^`, packed as `^<version>`. Boundary rule `published-dependency` enforces peers and bans dependencies on unpublished packages.
- **release-please (manifest mode):** one component per package, `linked-versions` (one shared version, so pre-1.0 peer ranges keep matching), tags `<package>-vX.Y.Z` (never `vX.Y.Z`), one grouped PR `chore(release): publish packages`. Manifest starts at `0.0.0`; the first release PR computes `0.1.0` from the history (`bump-minor-pre-major`).
- **Publishing:** `pnpm pack` per released path (resolves `workspace:`/`catalog:`), then `npm publish --provenance --access public` (npm 11 on Node 24 supports trusted publishing). Environment `npm` with `id-token: write`; `NPM_TOKEN` only for the first publish, because trusted publishers need existing packages. Owner steps in docs/operations/package-releases.md.
- **Verified:** `pnpm publish --dry-run` for the packages; the packed `@blixis-io/database` contains only `dist`, `LICENSE`, `README.md`, `package.json`, with `workspace:^` resolved to `^0.0.0` and `catalog:` to exact versions; the repository is public (provenance requirement).
- **Not done here:** the actual first publish, which needs the owner's npm token or trusted-publisher setup; the first release PR appears after this merges.

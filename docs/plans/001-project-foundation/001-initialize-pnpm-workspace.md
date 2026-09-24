# 001.001 — Initialize pnpm workspace and repository

## Status

```text
completed
```

## Parent plan

[001 — Project Foundation](./_index.md)

## Objective

Turn the repository into a pnpm monorepo root: add the root `package.json`, `pnpm-workspace.yaml`, version pinning, editor/ignore files, and update the root README — without creating any packages yet.

## Background

The architecture (§3) prescribes a workspace-based monorepo, preferably pnpm, with `apps/`, `packages/`, `modules/`, and `tooling/` directories. Everything afterwards assumes this root exists. The repository (`blixis-io/monorepo`, default branch `main`) currently contains only `README.md` and `docs/`. The target configuration is documented in `docs/development/monorepo.md`.

## Requirements

- Work on a branch per `docs/conventions/git-workflow.md` (e.g. `feat/001-001-initialize-pnpm-workspace`) and merge via PR with a Conventional Commit title.
- Create a private root `package.json` named `blixis` with `"private": true`, `"type": "module"`, and a `packageManager` field pinning pnpm (current stable major at implementation time).
- Pin Node via `engines.node` and a `.nvmrc` / `.node-version` using the current Active LTS at implementation time.
- Create `pnpm-workspace.yaml` registering `apps/*`, `packages/*`, `modules/*`, `tooling/*` (not `examples/*`), with a `catalog:` section for shared versions and a minimal `onlyBuiltDependencies` allow-list, as described in `docs/development/monorepo.md`.
- Create `.npmrc` with strict settings (e.g. `engine-strict=true`, `auto-install-peers=false` if it helps enforce explicit peers; record the final choice).
- Create `.gitignore` covering `node_modules`, `dist`, `.wrangler`, `.dev.vars`, `.env*` (except examples), coverage output, and OS/editor files.
- Create `.editorconfig` (UTF-8, LF, 2-space indent, final newline).
- Update the existing root `README.md` only where the workspace changes what it says (e.g. status line); keep its section links to `docs/`.
- Add placeholder root scripts (`lint`, `typecheck`, `test`, `build`, `format`) that later tasks will wire up; each must exit successfully even with zero packages (e.g. `pnpm -r --if-present <script>`).
- Do not create any package directories with contents yet (empty `apps/`, `packages/`, `modules/`, `tooling/` may exist with `.gitkeep` only if needed for globs).

## Architectural constraints

- ESM (`"type": "module"`) at the root.
- No runtime dependencies at the root; root `devDependencies` only.
- Do not commit secrets or `.dev.vars` files.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
package.json
pnpm-workspace.yaml
pnpm-lock.yaml
.nvmrc
.gitignore
.editorconfig
```

### Modify

```text
README.md
docs/ROADMAP.md
docs/plans/001-project-foundation/_index.md
docs/plans/001-project-foundation/001-initialize-pnpm-workspace.md
```

### Delete

```text
None.
```

## Proposed structure

```text
blixis/
├── docs/
├── package.json
├── pnpm-workspace.yaml
├── .npmrc
├── .nvmrc
├── .gitignore
├── .editorconfig
└── README.md
```

## Implementation steps

1. `git switch main && git pull --ff-only && git switch -c feat/001-001-initialize-pnpm-workspace`.
2. Create `package.json` with name, `private`, `type`, `packageManager`, `engines`, and placeholder recursive scripts.
3. Create `pnpm-workspace.yaml` with the four workspace globs.
4. Create `.npmrc`, `.nvmrc`, `.gitignore`, `.editorconfig`.
5. Update `README.md` status if needed.
6. Run `pnpm install` to generate `pnpm-lock.yaml` (add it to the Create list once generated).
7. Run every placeholder root script and confirm each exits 0.

## Dependencies

Requires:

- None

## Acceptance criteria

- [x] `docs/` and `README.md` are not ignored by `.gitignore`.
- [x] `pnpm install` completes without errors and produces `pnpm-lock.yaml`.
- [x] `pnpm -r ls` runs without error (zero packages is acceptable).
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format` each exit 0.
- [x] `.gitignore` ignores `.dev.vars` and `node_modules`.

## Validation

```bash
pnpm install
pnpm -r ls
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git check-ignore .dev.vars node_modules   # both paths must be printed
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
- [x] Pinned pnpm and Node versions are current stable/LTS and recorded in Technical notes.
- [x] No packages or source code were created.

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

- **Versions pinned (2026-09-24):** pnpm `12.6.0` (`packageManager`, via Corepack), Node `24` LTS (`.nvmrc`, `engines.node >=24`). TypeScript 7.0.2 is the current stable release; it is added in 001.002/001.003, not here.
- **Deviation — no `.npmrc`:** pnpm ≥ 10 reads workspace settings from `pnpm-workspace.yaml`, so `engineStrict: true`, `autoInstallPeers: false`, and `onlyBuiltDependencies: []` live there. `.npmrc` stays reserved for registry auth if ever needed. Verified with pnpm 12: `pnpm config get engine-strict` → `true`, `auto-install-peers` → `false`.
- **`autoInstallPeers: false`** enforces explicit peer dependencies (§25). If a third-party tool later fails because of missing peers, add the peer explicitly rather than re-enabling auto-install.
- **`onlyBuiltDependencies`** starts empty; tasks that add `esbuild`/`workerd` (via Wrangler/Vitest) must allow-list them explicitly.
- **Correction (found in 001.002 spike):** pnpm 12 replaced `onlyBuiltDependencies` with the **`allowBuilds`** map (`esbuild: true`); `pnpm approve-builds` rewrites the old key. `pnpm-workspace.yaml` now uses `allowBuilds: {}`. pnpm 12 also enforces a minimum release age for newly published versions and records exceptions in `minimumReleaseAgeExclude` when needed.
- **Catalog** is present as a commented template only; the first catalog entries arrive with TypeScript in 001.002/001.003.
- **Root scripts** use `pnpm -r --if-present run <script>`; with zero packages pnpm reports `Scope: 0 of 1 workspace projects` and exits 0. Later tasks replace `typecheck` with the TS7 build-mode command and `lint`/`format` with the ADR 0003 tools.
- `pnpm -r ls` lists only the root project; empty `apps/`, `packages/`, `modules/` directories are not tracked by Git.
- Repository already existed on GitHub (`blixis-io/monorepo`, public) with a docs bootstrap commit, so no `git init` was needed in this task.
- Corepack is enabled locally; `pnpm` now resolves to the pinned 12.6.0 inside this repository.

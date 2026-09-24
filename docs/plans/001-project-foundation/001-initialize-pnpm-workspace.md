# 001.001 — Initialize pnpm workspace and repository

## Status

```text
not-started
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
.npmrc
.nvmrc
.gitignore
.editorconfig
```

### Modify

```text
README.md
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

- [ ] `docs/` and `README.md` are not ignored by `.gitignore`.
- [ ] `pnpm install` completes without errors and produces `pnpm-lock.yaml`.
- [ ] `pnpm -r ls` runs without error (zero packages is acceptable).
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm format` each exit 0.
- [ ] `.gitignore` ignores `.dev.vars` and `node_modules`.

## Validation

```bash
pnpm install
pnpm -r ls
pnpm lint && pnpm typecheck && pnpm test && pnpm build
git check-ignore .dev.vars node_modules   # both paths must be printed
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
- [ ] Pinned pnpm and Node versions are current stable/LTS and recorded in Technical notes.
- [ ] No packages or source code were created.

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

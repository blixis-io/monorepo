# 023.001 — Scaffold the Starlight documentation site

## Status

```text
completed
```

## Parent plan

[023 — Developer Documentation Site](./_index.md)

## Objective

Create `apps/docs` (`@blixis/docs`, private) as a Starlight site with the manual's navigation skeleton, repository-consistent tooling (Biome, boundaries, TypeScript), and a CI build step.

## Background

Plan decisions choose Starlight. The site is an app in the workspace like `apps/api` and follows the same quality gates.

## Requirements

- Create `apps/docs` with Astro + Starlight (versions pinned in the catalog), `astro.config.mjs`, content collection config, and a landing page.
- Sidebar groups: *Getting started*, *Concepts*, *API reference* (filled by 023.002).
- Scripts: `dev`, `build`, `preview`, `check` (Astro type check if compatible; otherwise documented).
- Add required build-script approvals to `allowBuilds` (only what Astro/Starlight need).
- Exclude Astro build output (`dist/`, `.astro/`) from Git and Biome; make sure `tooling/boundaries` handles the app (it has no workspace imports yet).
- CI: add a `docs` build to the `verify` job (or a separate job named `docs`) so PRs that break the site fail.
- Link the site from `README.md` and `docs/contracts/README.md` (URL filled in by 023.004).

## Architectural constraints

- `apps/docs` never becomes a runtime dependency of any package.
- No DOM types leak into library tsconfigs.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/docs/package.json
apps/docs/astro.config.mjs
apps/docs/tsconfig.json
apps/docs/src/content.config.ts
apps/docs/src/content/docs/index.mdx
apps/docs/src/content/docs/getting-started/introduction.mdx
```

### Modify

```text
pnpm-workspace.yaml (catalog: astro, @astrojs/starlight; allowBuilds: esbuild)
pnpm-lock.yaml
.github/workflows/ci.yml (docs build step)
.gitignore (.astro/)
README.md
docs/ROADMAP.md
docs/plans/023-developer-documentation-site/_index.md
```

### Delete

```text
None.
```

## Implementation steps

1. Scaffold the app manually (no interactive `create astro`) with pinned versions.
2. Configure Starlight title, sidebar, edit links to GitHub.
3. Wire scripts, `allowBuilds`, ignores.
4. Build locally; add the CI step.

## Dependencies

Requires:

- [002.002 — Define module, metadata, contribution, and lifecycle contracts](../002-public-contracts/002-define-module-contracts.md)

## Acceptance criteria

- [x] `pnpm --filter @blixis/docs build` succeeds and produces static output.
- [x] `pnpm lint`, `pnpm typecheck`, `pnpm test` still pass at the root.
- [x] CI builds the docs on pull requests.

## Validation

```bash
pnpm --filter @blixis/docs build
pnpm lint && pnpm typecheck && pnpm test
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
- [x] No unnecessary Astro integrations.

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

- **Versions:** Astro 7.3.5, Starlight 0.42.3 (catalog). Scaffolded by hand (no interactive `create astro`).
- **Starlight ≥ 0.39 change:** sidebar groups can no longer use `{ label, autogenerate }` directly; they must be `{ label, items: [{ autogenerate: { directory } }] }` (build error with a helpful hint).
- **pnpm 12:** Astro/Vite needs `esbuild`'s install script → `allowBuilds: esbuild: true`. A failed install makes pnpm write a placeholder `esbuild: set this to true or false` line into `pnpm-workspace.yaml`; it had to be removed by hand.
- **No `astro check`:** it needs `@astrojs/check` + the TypeScript JS API, which TypeScript 7 does not provide. `apps/docs/tsconfig.json` (extends `astro/tsconfigs/strict`) is for editors only and is not part of the root `tsc -b` solution. The docs build itself validates content and config.
- Build warnings seen (framework noise, not errors): Vite `MODULE_LEVEL_DIRECTIVE` for MDX, empty `i18n` collection, 404 entry. Build output: static HTML + Pagefind search index + sitemap in `apps/docs/dist/` (git-ignored).
- `site` is a placeholder URL until 023.004 sets the real one; telemetry disabled.
- CI: `verify` job now also runs `pnpm --filter @blixis/docs build`.

# Commit Messages (Conventional Commits)

All commits on `main` — and therefore all pull request titles, because PRs are squash-merged — follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/). Commit types drive semantic versioning and release notes (see [Release & deployment](../operations/deployment.md)).

Related: [Git workflow](./git-workflow.md) · [Code standards](./code-standards.md)

---

## Format

```text
<type>(<scope>)!: <subject>

<body>

<footer(s)>
```

- **type** — required, from the list below.
- **scope** — optional but strongly recommended; one scope from the list below.
- **`!`** — marks a breaking change (also add a `BREAKING CHANGE:` footer).
- **subject** — imperative mood, lowercase first letter, no trailing period, max 72 characters for the whole header.
- **body** — optional; explain *what* and *why* (not how); wrap at 100 characters.
- **footers** — optional; `BREAKING CHANGE: …`, `Refs: #123`, `Closes #123`, `Task: 003.003`.

## Types

| Type | Use for | Release impact (pre-1.0 → post-1.0) |
|---|---|---|
| `feat` | New user-facing capability (API, module, SDK feature) | minor |
| `fix` | Bug fix | patch |
| `perf` | Performance improvement without behaviour change | patch |
| `refactor` | Code change that neither fixes a bug nor adds a feature | none |
| `docs` | Documentation only (including roadmap/task updates) | none |
| `test` | Adding or fixing tests only | none |
| `build` | Build system, package manifests, dependencies, TypeScript config | none (patch if it changes shipped artifacts) |
| `ci` | GitHub Actions workflows and CI scripts | none |
| `chore` | Maintenance that fits nothing else (tooling config, repo housekeeping) | none |
| `style` | Formatting only (no code change) | none |
| `revert` | Reverts a previous commit (`revert: feat(kernel): …`) | depends |

A `!` or `BREAKING CHANGE:` footer triggers a **major** bump after 1.0 (a **minor** bump while on `0.x`).

## Scopes

Use the package or area the change belongs to. Keep scopes lowercase and stable.

| Area | Scopes |
|---|---|
| Platform packages | `contracts`, `kernel`, `cloudflare`, `database`, `events`, `graphql`, `sdk`, `testing`, `shared`, `content-api` |
| Domain modules | `auth`, `users`, `spaces`, `permissions`, `content`, `assets`, `webhooks`, `releases` |
| Apps | `api`, `admin`, `example-site` |
| Cross-cutting | `deps` (dependency updates), `repo` (repository config), `roadmap` (roadmap/task files), `adr` (decision records), `release` (release PRs) |

Omit the scope only when a change truly spans many areas (prefer splitting the PR instead).

## Examples

```text
feat(kernel): add typed service registry with request scopes

fix(content): reject publish when referenced asset is unpublished

feat(contracts)!: rename ModuleMeta.requires to dependencies

BREAKING CHANGE: modules must declare `dependencies` instead of `requires`.

docs(roadmap): mark 001.001 as completed

build(deps): bump wrangler to 4.x

ci: run workers dry-run deploy on pull requests

chore(repo): add pull request template

test(events): cover outbox redelivery idempotency

refactor(database): extract tenancy predicate builder

Task: 005.007
```

## No AI attribution

Commits, pull requests, tags, and release notes are authored by the maintainer. They must **not** contain:

- `Co-Authored-By:` trailers for AI tools (Claude, Gemini, Codex, Copilot, or similar);
- lines such as "Generated with …" or "Written by AI";
- mentions of AI assistants in subjects, bodies, or footers.

This applies equally to humans and to coding agents working in this repository.

## Rules of thumb

- One logical change per commit; one Conventional Commit header per PR.
- If you cannot describe the change in one header, the PR is too big.
- Reference the roadmap task in the body or a `Task:` footer when applicable.
- Never commit secrets, `.dev.vars`, or `.env` files.

## Enforcement

- **CI:** the PR title is validated by a semantic-PR-title check (see [GitHub Actions](../operations/github-actions.md#pr-titleyml)).
- **Local (optional):** `pnpm exec lefthook install` enables a `commit-msg` hook running commitlint ([`commitlint.config.js`](../../commitlint.config.js), same types and scopes as above) and a `pre-commit` hook running `biome check` on staged files ([`lefthook.yml`](../../lefthook.yml)). Hooks are a convenience; CI is authoritative.

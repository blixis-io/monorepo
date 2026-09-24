# Git Workflow (GitHub Flow)

Blixis uses **GitHub Flow**: `main` is always deployable, and every change reaches `main` through a short-lived branch and a pull request.

Repository: [`blixis-io/monorepo`](https://github.com/blixis-io/monorepo)

Related: [Commit messages](./commit-messages.md) · [Environments](../operations/environments.md) · [Release & deployment](../operations/deployment.md) · [Repository settings](../operations/repository.md)

---

## Principles

1. **`main` is the staging environment.** Every merge to `main` is deployed to staging automatically, so `main` must always build, pass tests, and migrate cleanly.
2. **Production runs versions.** Production only receives tagged releases (`vX.Y.Z`) cut from `main`. See [Release & deployment](../operations/deployment.md).
3. **No direct pushes to `main`.** All changes go through a pull request with green CI. The only exception is the initial repository bootstrap commit.
4. **Short-lived branches.** Branches live hours to a few days. Rebase or merge `main` in often. Long-running feature branches are not allowed; hide unfinished work behind configuration or keep it unregistered in `blixis.config.ts`.
5. **One roadmap task per pull request** where practical. The PR links the task file and updates its status (see [ROADMAP.md](../ROADMAP.md#how-agents-use-this-roadmap)).

## Branch naming

```text
<type>/<short-kebab-description>
<type>/<task-id>-<short-kebab-description>
```

`<type>` uses the [Conventional Commit types](./commit-messages.md#types). Include the roadmap task ID (`PPP-TTT`) when the branch implements a task.

Examples:

```text
feat/001-001-initialize-pnpm-workspace
feat/003-003-service-registry-scopes
fix/entry-publish-idempotency
docs/git-workflow
ci/deploy-staging-concurrency
chore/deps-wrangler
```

## Lifecycle of a change

```text
main ──●─────────────────────────●──────────▶  (staging deploy on every merge)
        \                       /
         ●── commits ──●── PR ─┘  squash merge
   feat/001-001-initialize-pnpm-workspace
```

1. **Sync:** `git switch main && git pull --ff-only`.
2. **Branch:** `git switch -c feat/001-001-initialize-pnpm-workspace`.
3. **Work:** commit in small, logical steps using [Conventional Commits](./commit-messages.md). Keep the task file status up to date (`in-progress` → `review`).
4. **Push:** `git push -u origin HEAD`.
5. **Open a PR:** `gh pr create --fill --base main` (or via the UI). The PR title **must** be a valid Conventional Commit header, because it becomes the squash commit message on `main`.
6. **CI:** all required checks must pass (see [GitHub Actions](../operations/github-actions.md)).
7. **Review:** complete the task's review checklist; address findings in new commits (do not force-push after review has started unless asked).
8. **Merge:** **squash and merge** only. Delete the branch after merge (automatic).
9. **Staging:** the merge triggers the staging deployment; verify it (see [Environments](../operations/environments.md)).

## Pull requests

- **Title:** Conventional Commit header, e.g. `feat(kernel): add typed service registry with request scopes`. Checked by CI.
- **Body:** use the PR template (`.github/pull_request_template.md`, created during setup — see [setup checklist](../setup-checklist.md)):
  - summary of the change and why;
  - roadmap task link (e.g. `docs/plans/003-module-kernel/003-service-registry-and-scopes.md`);
  - validation performed (commands and results);
  - migrations included? (yes/no; expand/contract step);
  - breaking changes (and `BREAKING CHANGE:` footer in the squash message if any);
  - checklist: task status updated, technical notes updated, files-and-folders list updated, ROADMAP updated.
- **Size:** aim for reviewable PRs (< ~400 changed lines excluding generated files and lockfiles). Split otherwise.
- **Draft PRs** are welcome for early CI feedback.
- **No AI attribution** anywhere in titles, bodies, or commits — see [commit messages](./commit-messages.md#no-ai-attribution).

## Merge strategy

| Setting | Value | Why |
|---|---|---|
| Squash merge | **enabled (only option)** | One Conventional Commit per PR keeps `main` history readable and drives release notes. |
| Merge commits | disabled | Avoids noisy history. |
| Rebase merge | disabled | Individual branch commits are not guaranteed to be conventional or to build. |
| Default squash message | PR title + PR body | The PR title is validated; the body carries context and footers. |
| Linear history | required | Consequence of squash-only. |
| Auto-delete head branches | enabled | Keeps branches short-lived. |

## Hotfixes

GitHub Flow has no separate hotfix branches: fix on a normal branch (`fix/...`), merge to `main` (staging verifies it), then cut a **patch release** to deploy to production. For emergencies, production can be rolled back to the previous version first — see [Release & deployment](../operations/deployment.md#rollback).

## Releases

Releases are cut from `main` via a release PR maintained by release-please (recommended — see [Release & deployment](../operations/deployment.md)). Merging the release PR creates the tag `vX.Y.Z` and a GitHub Release, which deploys to production.

## Commit identity

All commits are authored with the maintainer's own Git identity and pushed with the maintainer's GitHub account:

```bash
git config user.name  "Michael"
git config user.email "michael@voeten.online"
```

Signed commits (SSH signing) are recommended — see [setup checklist](../setup-checklist.md#git-and-github-account).

## Useful commands

```bash
gh pr create --fill --base main          # open PR from current branch
gh pr checks --watch                     # follow CI
gh pr merge --squash --delete-branch     # merge when green (if allowed by rules)
gh run list --workflow ci.yml            # recent CI runs
gh release list                          # production versions
```

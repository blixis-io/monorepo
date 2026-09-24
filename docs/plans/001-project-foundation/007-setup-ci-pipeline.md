# 001.007 — Set up the continuous integration pipeline

## Status

```text
not-started
```

## Parent plan

[001 — Project Foundation](./_index.md)

## Objective

Create the GitHub Actions CI workflow (`verify` job) that, on every pull request and push to `main`, installs dependencies with a frozen lockfile and runs format check, lint (including boundaries), typecheck, test, and build; add the Conventional Commit PR-title check and the shared setup action; add the PR template.

## Background

Later plans rely on CI to prove that architecture rules hold continuously (§52: continuously prove the design). The target design is `docs/operations/github-actions.md`; this task implements its verification parts only. Staging/production deploy jobs are added by plans 004/021.

## Requirements

- Create `.github/workflows/ci.yml` with a `verify` job (stable job name — it becomes a required check) triggered on `push` to `main` and on `pull_request`, with `permissions: contents: read`, PR-run cancellation, and `timeout-minutes`.
- Create `.github/actions/setup/action.yml` (pnpm + Node from `.nvmrc` + store cache + frozen install).
- Create `.github/workflows/pr-title.yml` validating PR titles against the types/scopes in `docs/conventions/commit-messages.md` (semantic PR title action pinned by SHA).
- Create `.github/pull_request_template.md` per `docs/conventions/git-workflow.md#pull-requests`.
- Pin all third-party actions by commit SHA.
- Use the pinned Node and pnpm versions (`.nvmrc`, `packageManager`).
- Cache the pnpm store.
- Steps: `pnpm install --frozen-lockfile`, `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.
- Fail fast on the first failing gate; keep jobs readable (one job with clear steps is fine initially).
- Add a CI status badge to `README.md`.
- Apply the `main` ruleset (require PR + `verify` + `pr-title`) per `docs/operations/repository.md` if the GitHub plan allows; otherwise record the limitation in Technical notes.

## Architectural constraints

- No secrets are required for this pipeline.
- Do not add deploy steps here.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
.github/workflows/ci.yml
.github/workflows/pr-title.yml
.github/actions/setup/action.yml
.github/pull_request_template.md
```

### Modify

```text
README.md
docs/operations/github-actions.md (only if the implementation deviates)
```

### Delete

```text
None.
```

## Implementation steps

1. Re-read `docs/operations/github-actions.md`.
2. Write the workflow with setup for Node + pnpm + cache.
3. Add the gate steps in order.
4. Push the branch and open a pull request with `gh pr create` to verify both workflows.
5. Record run duration and any caching issues in Technical notes.

## Dependencies

Requires:

- [001.005 — Configure linting, formatting, and package-boundary checks](./005-configure-lint-format-and-boundaries.md)
- [001.006 — Configure the test runner for unit and Workers-runtime tests](./006-configure-test-runner.md)

## Acceptance criteria

- [ ] The workflow runs on pull requests and on pushes to `main`.
- [ ] All six gates run and pass on the current repository.
- [ ] A deliberately failing test makes the workflow fail (verified once, then reverted).
- [ ] A PR titled `update stuff` fails `pr-title`; `ci: add verification workflow` passes.

## Validation

- Observe a green workflow run on a pull request.
- Observe a red run for a deliberately broken commit, then revert.

## Review checklist

- [ ] Implementation matches this task specification (requirements and constraints).
- [ ] Package boundaries respected: no cross-package relative imports, no imports of another package's internals.
- [ ] No unnecessary or Workers-incompatible dependencies introduced; every new dependency is justified in Technical notes.
- [ ] TypeScript is strict; no unjustified `any`, no unchecked casts at untrusted boundaries.
- [ ] Tests added for new behavior; validation commands pass.
- [ ] Documentation matches the implementation.
- [ ] `Files and folders` reflects the actual change set.
- [ ] `Technical notes` updated with relevant findings.
- [ ] Workflow uses frozen lockfile and pinned versions.
- [ ] No secrets or deploy steps present.

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

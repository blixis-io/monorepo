# 023.004 — Deploy the documentation site to Cloudflare

## Status

```text
not-started
```

## Parent plan

[023 — Developer Documentation Site](./_index.md)

## Objective

Deploy the built site as a Cloudflare Worker with static assets (`blixis-docs`), from GitHub Actions on every push to `main`, with a documented manual deploy path.

## Background

Cloudflare is the platform (§11); the docs are public like the repository. Workers static assets serve prebuilt sites without Worker code.

## Requirements

- `apps/docs/wrangler.jsonc`: assets-only Worker `blixis-docs`, `assets.directory` = Astro output, `not_found_handling` suitable for a static site, pinned `compatibility_date`.
- GitHub Actions: deploy job on push to `main` (after `verify`), using `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` from a `docs` (or repository) environment; skipped cleanly when secrets are missing.
- First deploy performed with the owner's approval; URL recorded in README and docs.
- `docs/operations/cloudflare.md`: add the docs Worker to the resource inventory.

## Architectural constraints

- No secrets in the repository; PR workflows never deploy.

## Files and folders

> Living record. Before implementation this is the expected change set; after implementation it MUST be corrected to the actual change set.

### Create

```text
apps/docs/wrangler.jsonc
.github/workflows/docs.yml
```

### Modify

```text
apps/docs/package.json
docs/operations/cloudflare.md
README.md
```

### Delete

```text
None.
```

## Implementation steps

1. Add Wrangler config and `deploy` script.
2. Dry-run locally.
3. Add the workflow.
4. First deploy (owner approval) and record the URL.

## Dependencies

Requires:

- [023.003 — Write the developer manual for module authors](./003-write-developer-manual.md)

## Acceptance criteria

- [ ] `wrangler deploy --dry-run` succeeds for the docs app.
- [ ] The site is reachable on its URL after deploy.
- [ ] The workflow deploys on `main` and never on pull requests.

## Validation

```bash
pnpm --filter @blixis/docs build
pnpm --filter @blixis/docs exec wrangler deploy --dry-run
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
- [ ] API token scope limited to Workers scripts for this account.

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
